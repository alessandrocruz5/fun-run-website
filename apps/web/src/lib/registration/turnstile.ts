import { baseEnvSchema, createEnv, EnvValidationError } from "@rr/env";
import { z } from "zod";
import { logError } from "./confirm";

/**
 * Cloudflare Turnstile for the registration form. Server only: the secret key never reaches the
 * browser. `verifyTurnstile()` runs before the first database write or PayMongo call, and fails
 * closed: no token, a rejected token (invalid, expired or already used) and an unreachable
 * Cloudflare all stop the registration.
 */

/** The hidden input the widget adds to the form. */
export const TURNSTILE_FIELD = "cf-turnstile-response";

/**
 * A decoy input, hidden from people. A bot that fills in every input fills this too. The name
 * is one browsers don't autofill, so a person never sets it by accident.
 */
export const HONEYPOT_FIELD = "fax_number";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Cloudflare's documented maximum token length. */
const MAX_TOKEN_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 5_000;

const secretEnvSchema = baseEnvSchema.extend({ TURNSTILE_SECRET_KEY: z.string().min(1) });
const siteEnvSchema = baseEnvSchema.extend({ TURNSTILE_SITE_KEY: z.string().min(1) });

/**
 * The public site key for the widget, read per request: `next build` runs with no environment
 * variables. `null` when it isn't set, so the page still renders and the form says registration
 * is paused instead of the whole site returning 500.
 */
export function getTurnstileSiteKey(source?: Record<string, string | undefined>): string | null {
  try {
    return createEnv(siteEnvSchema, source).TURNSTILE_SITE_KEY;
  } catch (error) {
    logError("turnstile.site_key_missing", error);
    return null;
  }
}

const siteverifySchema = z.object({
  success: z.boolean(),
  "error-codes": z.array(z.string()).default([]),
});

export type TurnstileResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * `missing`: no token was posted. `rejected`: Cloudflare says the token is invalid, expired
       * or already used. `unavailable`: no verdict (misconfigured, unreachable or erroring).
       */
      reason: "missing" | "rejected" | "unavailable";
      /** Cloudflare's error codes, e.g. `timeout-or-duplicate`. Codes only, never data. */
      codes?: string[];
    };

/** Cloudflare's own failure, as opposed to a verdict on the token. */
const SERVER_ERROR_CODES = new Set(["internal-error", "bad-request", "invalid-input-secret"]);

/**
 * Ask Cloudflare whether `token` (the form's `cf-turnstile-response`) is valid. Tokens are single
 * use and expire after 5 minutes, so a replayed token comes back `rejected`. The visitor's IP is
 * not sent: it is optional, and not needed for this check.
 */
export async function verifyTurnstile(
  token: FormDataEntryValue | null,
  source?: Record<string, string | undefined>,
): Promise<TurnstileResult> {
  if (typeof token !== "string" || token === "" || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "missing" };
  }

  let secret: string;
  try {
    secret = createEnv(secretEnvSchema, source).TURNSTILE_SECRET_KEY;
  } catch (error) {
    if (error instanceof EnvValidationError) logError("turnstile.env_invalid", error);
    return { ok: false, reason: "unavailable" };
  }

  let body: z.infer<typeof siteverifySchema>;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    // Cloudflare answers a rejected token with 200 `success: false`; a 4xx/5xx is its own fault.
    if (!response.ok)
      return { ok: false, reason: "unavailable", codes: [`http-${response.status}`] };
    body = siteverifySchema.parse(await response.json());
  } catch (error) {
    logError("turnstile.verify_failed", error);
    return { ok: false, reason: "unavailable" };
  }

  if (body.success) return { ok: true };
  const codes = body["error-codes"];
  const reason = codes.some((code) => SERVER_ERROR_CODES.has(code)) ? "unavailable" : "rejected";
  return { ok: false, reason, codes };
}
