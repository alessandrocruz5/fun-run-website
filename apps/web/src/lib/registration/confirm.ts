import {
  claimConfirmation,
  type Db,
  getDb,
  getRegistrationByCheckoutSessionId,
  markPaid,
  RACES,
  type Registration,
  releaseConfirmation,
} from "@rr/db";
import { EmailError, type RegistrationConfirmedProps, sendRegistrationConfirmed } from "@rr/email";
import { EnvValidationError } from "@rr/env";
import {
  type CheckoutSession,
  createPayMongoClient,
  getPaymentsEnv,
  isCheckoutSessionId,
  PayMongoError,
} from "@rr/payments";
import { formatGunTime, formatPeso, getRaceView, getSiteUrl, SITE } from "@/content/site";

/**
 * A registration becomes `paid` only through `confirmPayment()`, given a checkout session that the
 * server read from PayMongo: the success page looks it up (`checkCheckout()`), and the signed
 * webhook (FRW-6) receives it. Nothing in a URL is trusted. Server only.
 *
 * Every caller that sees `paid` then sends the confirmation email (FRW-8), and exactly one of them
 * wins the claim on the row. A failed send releases the claim and throws, so the webhook answers
 * 5xx (PayMongo retries) and the success page offers "check again".
 */

/** httpOnly cookie, set by the form just before the redirect to PayMongo: the checkout session ID. */
export const CHECKOUT_COOKIE = "rr_checkout";

/** The Postgres SQLSTATE (e.g. `42501`) under a database error: a code, never data. */
function sqlState(error: unknown): string | undefined {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

/**
 * Log a failure without personal data (RA 10173): the error's class, plus PayMongo's or Resend's
 * status and codes, the env keys at fault or the SQLSTATE. Never the message of a database error,
 * which quotes the query's parameters (names, emails).
 */
export function logError(event: string, error: unknown, ids: Record<string, string> = {}): void {
  const code = sqlState(error);
  const details =
    error instanceof PayMongoError
      ? { status: error.status, codes: error.codes }
      : error instanceof EmailError
        ? { status: error.status, codes: error.code ? [error.code] : [] }
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

/** Runners assemble at the start area this long before their race's gun time. */
export const ASSEMBLY_MINUTES_BEFORE_GUN = 30;

/** `05:00` → `4:30 AM`. */
function assemblyTime(gunTime: string): string {
  const [h = 0, m = 0] = gunTime.split(":").map(Number);
  const minutes = (((h * 60 + m - ASSEMBLY_MINUTES_BEFORE_GUN) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  return formatGunTime(`${hh}:${String(minutes % 60).padStart(2, "0")}`);
}

/** What the email shows, formatted exactly as the site and success page show it. */
export function confirmationDetails(registration: Registration): RegistrationConfirmedProps {
  const race = getRaceView(registration.race);
  return {
    eventName: `${SITE.name} ${SITE.edition}`,
    organizer: SITE.organizer,
    firstName: registration.firstName,
    fullName: `${registration.firstName} ${registration.lastName}`,
    raceLabel: race.label,
    reference: registration.reference,
    amount: formatPeso(registration.amountCentavos),
    raceDay: SITE.raceDay,
    venue: SITE.venue,
    assemblyTime: assemblyTime(RACES[registration.race].gunTime),
    gunTime: race.start,
    privacyUrl: `${getSiteUrl()}/privacy`,
    retentionDays: SITE.retentionDays,
  };
}

/**
 * Send the confirmation email for a paid registration, once. Only the caller that wins the claim
 * on the row sends; the rest return at once. If the send fails, the claim is released and the error
 * rethrown, so the next attempt (webhook retry, success-page reload) claims it again. Resend's
 * idempotency key is the registration ID, so even a send that reached Resend before failing here
 * can't go out twice within 24 hours.
 */
export async function sendConfirmation(db: Db, registration: Registration): Promise<void> {
  if (registration.status !== "paid" || registration.confirmationSentAt) return;
  const claimed = await claimConfirmation(db, registration.id);
  if (!claimed) return;

  const ids = { registrationId: claimed.id };
  try {
    const result = await sendRegistrationConfirmed({
      registrationId: claimed.id,
      to: claimed.email,
      details: confirmationDetails(claimed),
    });
    if (result.status === "duplicate") console.warn("email.duplicate", ids);
  } catch (error) {
    logError("email.send_failed", error, ids);
    try {
      await releaseConfirmation(db, claimed.id);
    } catch (releaseError) {
      logError("email.release_failed", releaseError, ids);
    }
    throw error;
  }
}

/** A `paid` result, after the confirmation email (sent now, or already sent). */
async function confirmed(db: Db, registration: Registration): Promise<ConfirmResult> {
  await sendConfirmation(db, registration);
  return { status: "paid", registration };
}

/**
 * Record the session's payment on its registration, once, then send the confirmation email
 * (`sendConfirmation()`). The paid amount must equal the price snapshotted on the row (checked here
 * and again by `markPaid`'s WHERE clause). Safe to call any number of times, from both callers at
 * once: only one write and one email win, and every call then reports `paid`. Throws if the email
 * fails, after releasing its claim, so the caller can retry.
 */
export async function confirmPayment(db: Db, session: CheckoutSession): Promise<ConfirmResult> {
  if (session.livemode) return rejected(session, "livemode");

  const registration = await getRegistrationByCheckoutSessionId(db, session.id);
  if (!registration) return rejected(session, "unknown_session");
  if (session.metadata.registration_id !== registration.id) {
    return rejected(session, "metadata_mismatch");
  }
  if (registration.status === "paid") return confirmed(db, registration);

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
  if (paid) return confirmed(db, paid);

  // The other caller got there first and recorded it.
  const current = await getRegistrationByCheckoutSessionId(db, session.id);
  if (current?.status === "paid") return confirmed(db, current);
  return rejected(session, "not_recorded");
}

export type CheckoutCheck = ConfirmResult | { status: "not_found" } | { status: "unavailable" };

/**
 * The success page's check: find our registration for the session ID from the cookie, read the
 * session from PayMongo and confirm it. A session we don't know is never sent to PayMongo. A failed
 * confirmation email reports `unavailable`, so the runner's "check again" retries it.
 */
export async function checkCheckout(checkoutSessionId: string | undefined): Promise<CheckoutCheck> {
  if (!isCheckoutSessionId(checkoutSessionId)) return { status: "not_found" };
  try {
    const db = getDb();
    const registration = await getRegistrationByCheckoutSessionId(db, checkoutSessionId);
    if (!registration) return { status: "not_found" };
    if (registration.status === "paid") return await confirmed(db, registration);

    const paymongo = createPayMongoClient({ secretKey: getPaymentsEnv().PAYMONGO_SECRET_KEY });
    return await confirmPayment(db, await paymongo.retrieveCheckoutSession(checkoutSessionId));
  } catch (error) {
    logError("payment.check_failed", error, { checkoutSessionId });
    return { status: "unavailable" };
  }
}
