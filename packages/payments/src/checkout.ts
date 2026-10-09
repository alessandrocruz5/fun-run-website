import { z } from "zod";
import { testSecretKeySchema } from "./env";

/**
 * PayMongo Hosted Checkout: create a checkout session, send the runner to its `checkoutUrl`, and
 * read it back later to see whether it was paid. Amounts are integer centavos, currency PHP.
 *
 * Errors carry an HTTP status and PayMongo's error codes only, never a request or response body,
 * so nothing a runner typed can reach a log (RA 10173).
 */

const API_URL = "https://api.paymongo.com/v1";
const TIMEOUT_MS = 10_000;

/** Offered on the hosted checkout page. All of them can be simulated in test mode. */
export const PAYMENT_METHOD_TYPES = ["card", "gcash", "paymaya", "grab_pay"] as const;

const CHECKOUT_SESSION_ID = /^cs_[A-Za-z0-9]+$/;

/** A well-formed checkout session ID (`cs_…`), safe to put in a URL path. */
export function isCheckoutSessionId(value: unknown): value is string {
  return typeof value === "string" && CHECKOUT_SESSION_ID.test(value);
}

export class PayMongoError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when no usable response arrived. */
    public readonly status = 0,
    /** PayMongo error codes such as `parameter_invalid`. The `detail` text is dropped. */
    public readonly codes: readonly string[] = [],
  ) {
    super(message);
    this.name = "PayMongoError";
  }
}

export type Payment = {
  id: string;
  /** `paid`, `pending` or `failed`. */
  status: string;
  amountCentavos: number;
  currency: string;
  feeCentavos: number;
  netCentavos: number;
  /** The payment source type: `card`, `gcash`, `paymaya`, … */
  method: string;
  paidAt: Date | null;
  livemode: boolean;
};

export type CheckoutSession = {
  id: string;
  checkoutUrl: string;
  /** `active` or `expired`. */
  status: string;
  livemode: boolean;
  metadata: Record<string, string>;
  /** Filled in only when the session is read with the secret key. */
  payments: Payment[];
};

const paymentResource = z.object({
  id: z.string(),
  attributes: z.object({
    status: z.string(),
    amount: z.number().int(),
    currency: z.string(),
    fee: z.number().int(),
    net_amount: z.number().int(),
    livemode: z.boolean(),
    paid_at: z.number().int().nullish(),
    source: z.object({ type: z.string() }).nullish(),
  }),
});

const checkoutSessionResource = z.object({
  id: z.string().regex(CHECKOUT_SESSION_ID),
  attributes: z.object({
    checkout_url: z.string(),
    status: z.string(),
    livemode: z.boolean(),
    metadata: z.record(z.string(), z.string()).nullish(),
    payments: z.array(paymentResource).nullish(),
  }),
});

/**
 * Map a PayMongo checkout session resource (`{ id, attributes }`) to a `CheckoutSession`. The
 * webhook's `data.attributes.data` has the same shape.
 */
export function parseCheckoutSession(resource: unknown): CheckoutSession {
  const parsed = checkoutSessionResource.safeParse(resource);
  if (!parsed.success) throw new PayMongoError("Unexpected PayMongo checkout session");
  const { id, attributes: a } = parsed.data;
  return {
    id,
    checkoutUrl: a.checkout_url,
    status: a.status,
    livemode: a.livemode,
    metadata: a.metadata ?? {},
    payments: (a.payments ?? []).map(({ id: paymentId, attributes: p }) => ({
      id: paymentId,
      status: p.status,
      amountCentavos: p.amount,
      currency: p.currency,
      feeCentavos: p.fee,
      netCentavos: p.net_amount,
      method: p.source?.type ?? "unknown",
      paidAt: p.paid_at == null ? null : new Date(p.paid_at * 1000),
      livemode: p.livemode,
    })),
  };
}

const errorBody = z.object({ errors: z.array(z.object({ code: z.string() })) });

function errorCodes(body: unknown): string[] {
  const parsed = errorBody.safeParse(body);
  return parsed.success ? parsed.data.errors.map((e) => e.code) : [];
}

function isPayMongoCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.paymongo.com";
  } catch {
    return false;
  }
}

export type CreateCheckoutSessionInput = {
  /** Our registration ID: the only metadata PayMongo gets, so no personal data leaves us. */
  registrationId: string;
  /** The one line on the checkout page. The amount is the registration's price snapshot. */
  lineItem: { name: string; amountCentavos: number };
  description: string;
  successUrl: string;
  cancelUrl: string;
};

export type PayMongoClient = {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;
  retrieveCheckoutSession(id: string): Promise<CheckoutSession>;
};

/** Throws on anything but a test secret key, whatever the environment says. */
export function createPayMongoClient(options: {
  secretKey: string;
  fetch?: typeof fetch;
}): PayMongoClient {
  if (!testSecretKeySchema.safeParse(options.secretKey).success) {
    throw new Error("The PayMongo client accepts test secret keys (sk_test_…) only");
  }
  const authorization = `Basic ${btoa(`${options.secretKey}:`)}`;
  const send = options.fetch ?? fetch;

  async function request(path: string, body?: unknown): Promise<CheckoutSession> {
    let response: Response;
    try {
      response = await send(`${API_URL}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          accept: "application/json",
          authorization,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PayMongoError("PayMongo request failed");
    }
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new PayMongoError(
        `PayMongo responded ${response.status}`,
        response.status,
        errorCodes(json),
      );
    }
    const parsed = z.object({ data: z.unknown() }).safeParse(json);
    if (!parsed.success) throw new PayMongoError("Unexpected PayMongo response", response.status);
    return parseCheckoutSession(parsed.data.data);
  }

  return {
    async createCheckoutSession(input) {
      const { name, amountCentavos } = input.lineItem;
      if (!Number.isSafeInteger(amountCentavos) || amountCentavos <= 0) {
        throw new RangeError("Checkout amount must be a positive whole number of centavos");
      }
      const session = await request("/checkout_sessions", {
        data: {
          attributes: {
            line_items: [{ name, amount: amountCentavos, currency: "PHP", quantity: 1 }],
            payment_method_types: PAYMENT_METHOD_TYPES,
            description: input.description,
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            // Our own confirmation email goes out after payment (FRW-8).
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            metadata: { registration_id: input.registrationId },
          },
        },
      });
      if (!isPayMongoCheckoutUrl(session.checkoutUrl)) {
        throw new PayMongoError("Unexpected checkout URL", 200);
      }
      return session;
    },

    async retrieveCheckoutSession(id) {
      if (!isCheckoutSessionId(id)) throw new RangeError("Not a checkout session ID");
      const session = await request(`/checkout_sessions/${id}`);
      if (session.id !== id) throw new PayMongoError("PayMongo returned another session", 200);
      return session;
    },
  };
}
