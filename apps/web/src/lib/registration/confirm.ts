import {
  type Db,
  getDb,
  getRegistrationByCheckoutSessionId,
  markPaid,
  type Registration,
} from "@rr/db";
import { EnvValidationError } from "@rr/env";
import {
  type CheckoutSession,
  createPayMongoClient,
  getPaymentsEnv,
  isCheckoutSessionId,
  PayMongoError,
} from "@rr/payments";

/**
 * A registration becomes `paid` only through `confirmPayment()`, given a checkout session that the
 * server read from PayMongo: the success page looks it up (`checkCheckout()`), and the signed
 * webhook (FRW-6) receives it. Nothing in a URL is trusted. Server only.
 */

/** httpOnly cookie, set by the form just before the redirect to PayMongo: the checkout session ID. */
export const CHECKOUT_COOKIE = "rr_checkout";

/** The Postgres SQLSTATE (e.g. `42501`) under a database error: a code, never data. */
function sqlState(error: unknown): string | undefined {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

/**
 * Log a failure without personal data (RA 10173): the error's class, plus PayMongo's status and
 * codes, the env keys at fault or the SQLSTATE. Never the message of a database error, which
 * quotes the query's parameters (names, emails).
 */
export function logError(event: string, error: unknown, ids: Record<string, string> = {}): void {
  const code = sqlState(error);
  const details =
    error instanceof PayMongoError
      ? { status: error.status, codes: error.codes }
      : error instanceof EnvValidationError
        ? { issues: error.issues }
        : code
          ? { code }
          : {};
  console.error(event, {
    ...ids,
    error: error instanceof Error ? error.name : typeof error,
    ...details,
  });
}

export type RejectReason =
  "livemode" | "unknown_session" | "metadata_mismatch" | "amount_mismatch" | "not_recorded";

export type ConfirmResult =
  | { status: "paid"; registration: Registration }
  | { status: "unpaid"; registration: Registration }
  | { status: "rejected"; reason: RejectReason };

function rejected(session: CheckoutSession, reason: RejectReason): ConfirmResult {
  console.warn("payment.rejected", { checkoutSessionId: session.id, reason });
  return { status: "rejected", reason };
}

/**
 * Record the session's payment on its registration, once. The paid amount must equal the price
 * snapshotted on the row (checked here and again by `markPaid`'s WHERE clause). Safe to call any
 * number of times, from both callers at once: only one write wins, and every call then reports
 * `paid`.
 */
export async function confirmPayment(db: Db, session: CheckoutSession): Promise<ConfirmResult> {
  if (session.livemode) return rejected(session, "livemode");

  const registration = await getRegistrationByCheckoutSessionId(db, session.id);
  if (!registration) return rejected(session, "unknown_session");
  if (session.metadata.registration_id !== registration.id) {
    return rejected(session, "metadata_mismatch");
  }
  if (registration.status === "paid") return { status: "paid", registration };

  const payment = session.payments.find((p) => p.status === "paid");
  if (!payment) return { status: "unpaid", registration };
  if (payment.livemode) return rejected(session, "livemode");
  if (payment.currency !== "PHP" || payment.amountCentavos !== registration.amountCentavos) {
    return rejected(session, "amount_mismatch");
  }

  const paid = await markPaid(db, {
    checkoutSessionId: session.id,
    amountCentavos: payment.amountCentavos,
    paymentId: payment.id,
    paymentMethod: payment.method,
    feeCentavos: payment.feeCentavos,
    netCentavos: payment.netCentavos,
    paidAt: payment.paidAt ?? new Date(),
  });
  if (paid) return { status: "paid", registration: paid };

  // The other caller got there first and recorded it.
  const current = await getRegistrationByCheckoutSessionId(db, session.id);
  if (current?.status === "paid") return { status: "paid", registration: current };
  return rejected(session, "not_recorded");
}

export type CheckoutCheck = ConfirmResult | { status: "not_found" } | { status: "unavailable" };

/**
 * The success page's check: find our registration for the session ID from the cookie, read the
 * session from PayMongo and confirm it. A session we don't know is never sent to PayMongo.
 */
export async function checkCheckout(checkoutSessionId: string | undefined): Promise<CheckoutCheck> {
  if (!isCheckoutSessionId(checkoutSessionId)) return { status: "not_found" };
  try {
    const db = getDb();
    const registration = await getRegistrationByCheckoutSessionId(db, checkoutSessionId);
    if (!registration) return { status: "not_found" };
    if (registration.status === "paid") return { status: "paid", registration };

    const paymongo = createPayMongoClient({ secretKey: getPaymentsEnv().PAYMONGO_SECRET_KEY });
    return await confirmPayment(db, await paymongo.retrieveCheckoutSession(checkoutSessionId));
  } catch (error) {
    logError("payment.check_failed", error, { checkoutSessionId });
    return { status: "unavailable" };
  }
}
