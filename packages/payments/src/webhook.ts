import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PayMongoError } from "./checkout";

/**
 * PayMongo webhooks: check the `Paymongo-Signature` header against the raw request body, then read
 * the event. The header is `t=<unix seconds>,te=<test-mode signature>,li=<live-mode signature>`,
 * and each signature is the hex HMAC-SHA256 of `<t>.<raw body>` keyed with the webhook's secret.
 *
 * Test mode only: `te` is the only signature compared, so a live-mode delivery (empty `te`) never
 * verifies. Node only (`node:crypto`).
 */

/** Request header names are case-insensitive; `Headers.get()` takes any case. */
export const SIGNATURE_HEADER = "paymongo-signature";

/** A delivery signed further than this from now, either way, is refused as a replay. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/** The only event the app acts on. */
export const CHECKOUT_SESSION_PAID = "checkout_session.payment.paid";

export type SignatureCheck =
  { ok: true } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

const TIMESTAMP = /^\d{1,12}$/;
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/** `k=v,k=v` into a map, or null when a part has no key or a key repeats. Empty parts are skipped. */
function parseHeader(header: string): Map<string, string> | null {
  const parts = new Map<string, string>();
  for (const part of header.split(",")) {
    if (!part.trim()) continue;
    const separator = part.indexOf("=");
    const key = part.slice(0, separator).trim();
    if (separator < 0 || !key || parts.has(key)) return null;
    parts.set(key, part.slice(separator + 1).trim());
  }
  return parts;
}

/**
 * Whether `rawBody` was signed by PayMongo with `secret` within the last few minutes. The
 * signatures are compared in constant time. `rawBody` must be the body exactly as received, before
 * any JSON parsing.
 */
export function verifyWebhookSignature(options: {
  header: string | null | undefined;
  rawBody: string;
  secret: string;
  /** Unix seconds. Defaults to the current time. */
  now?: number;
}): SignatureCheck {
  if (!options.header) return { ok: false, reason: "missing" };

  const parts = parseHeader(options.header);
  const timestamp = parts?.get("t");
  const signature = parts?.get("te");
  if (!timestamp || !TIMESTAMP.test(timestamp) || !signature || !HEX_SHA256.test(signature)) {
    return { ok: false, reason: "malformed" };
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const expected = createHmac("sha256", options.secret)
    .update(`${timestamp}.${options.rawBody}`)
    .digest();
  // Both are 32 bytes: `signature` is 64 hex digits.
  return timingSafeEqual(expected, Buffer.from(signature, "hex"))
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}

export type WebhookEvent = {
  /** PayMongo's event ID (`evt_…`). */
  id: string;
  /** e.g. `checkout_session.payment.paid`. */
  type: string;
  livemode: boolean;
  /** The resource the event is about: a checkout session for `checkout_session.payment.paid`. */
  data: unknown;
};

const eventResource = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      type: z.string(),
      livemode: z.boolean(),
      data: z.unknown(),
    }),
  }),
});

/** Read a verified raw body as a PayMongo event. Throws `PayMongoError`, never quoting the body. */
export function parseWebhookEvent(rawBody: string): WebhookEvent {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new PayMongoError("PayMongo event is not JSON");
  }
  const parsed = eventResource.safeParse(json);
  if (!parsed.success) throw new PayMongoError("Unexpected PayMongo event");
  const { id, attributes } = parsed.data.data;
  return { id, type: attributes.type, livemode: attributes.livemode, data: attributes.data };
}
