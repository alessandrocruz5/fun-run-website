import { and, eq, gt, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "./client";
import { isRaceId, RACES, type RaceId } from "./races";
import { type Registration, registrations } from "./schema";

// Each step is one conditional statement, so retries and races (webhook vs. success page) are
// safe: a step that doesn't apply matches no row and returns null/false. Errors name no personal
// data (RA 10173).

export type RunnerDetails = Pick<
  typeof registrations.$inferInsert,
  | "firstName"
  | "lastName"
  | "email"
  | "mobile"
  | "birthdate"
  | "sex"
  | "shirtSize"
  | "emergencyContactName"
  | "emergencyContactMobile"
>;

export type CreatePendingInput = RunnerDetails & {
  race: RaceId;
  /** The runner ticked the privacy consent box. `consent_at` is stamped by the database. */
  consent: true;
};

/**
 * Insert a `pending` registration. The amount is the race's price from `RACES`, snapshotted on
 * the row; any amount the caller passes is ignored.
 */
export async function createPending(db: Db, input: CreatePendingInput): Promise<Registration> {
  if (!isRaceId(input.race)) throw new Error("Unknown race");
  if (input.consent !== true) throw new Error("Consent is required");

  const [row] = await db
    .insert(registrations)
    .values({
      race: input.race,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      mobile: input.mobile,
      birthdate: input.birthdate,
      sex: input.sex,
      shirtSize: input.shirtSize,
      emergencyContactName: input.emergencyContactName,
      emergencyContactMobile: input.emergencyContactMobile,
      consentAt: sql`now()`,
      amountCentavos: RACES[input.race].priceCentavos,
    })
    .returning();
  if (!row) throw new Error("Registration insert returned no row");
  return row;
}

/** Link a pending registration to its PayMongo checkout session. Only set once. */
export async function attachCheckoutSession(
  db: Db,
  id: string,
  checkoutSessionId: string,
): Promise<Registration | null> {
  const [row] = await db
    .update(registrations)
    .set({ checkoutSessionId })
    .where(
      and(
        eq(registrations.id, id),
        eq(registrations.status, "pending"),
        isNull(registrations.checkoutSessionId),
      ),
    )
    .returning();
  return row ?? null;
}

export function getRegistrationByReference(
  db: Db,
  reference: string,
): Promise<Registration | null> {
  return db
    .select()
    .from(registrations)
    .where(eq(registrations.reference, reference))
    .limit(1)
    .then(([row]) => row ?? null);
}

export function getRegistrationByCheckoutSessionId(
  db: Db,
  checkoutSessionId: string,
): Promise<Registration | null> {
  return db
    .select()
    .from(registrations)
    .where(eq(registrations.checkoutSessionId, checkoutSessionId))
    .limit(1)
    .then(([row]) => row ?? null);
}

export type MarkPaidInput = {
  checkoutSessionId: string;
  /** The amount PayMongo says was paid. It must equal the row's price snapshot. */
  amountCentavos: number;
  paymentId: string;
  paymentMethod: string;
  feeCentavos: number;
  netCentavos: number;
  paidAt: Date;
};

/**
 * Record a payment in one conditional update. It applies only to a not-yet-paid row whose
 * snapshotted amount equals the paid amount; otherwise it changes nothing and returns null, so a
 * second call (webhook retry, success-page race) is a no-op.
 *
 * A `cancelled` row can still become `paid`: money that was actually taken is always recorded.
 */
export async function markPaid(db: Db, input: MarkPaidInput): Promise<Registration | null> {
  const [row] = await db
    .update(registrations)
    .set({
      status: "paid",
      paymentId: input.paymentId,
      paymentMethod: input.paymentMethod,
      feeCentavos: input.feeCentavos,
      netCentavos: input.netCentavos,
      paidAt: input.paidAt,
    })
    .where(
      and(
        eq(registrations.checkoutSessionId, input.checkoutSessionId),
        ne(registrations.status, "paid"),
        eq(registrations.amountCentavos, input.amountCentavos),
      ),
    )
    .returning();
  return row ?? null;
}

/** Mark an unpaid registration as cancelled. A paid row is never touched. */
export async function markCancelled(db: Db, id: string): Promise<Registration | null> {
  const [row] = await db
    .update(registrations)
    .set({ status: "cancelled" })
    .where(and(eq(registrations.id, id), eq(registrations.status, "pending")))
    .returning();
  return row ?? null;
}

// The confirmation email is claimed, then sent, then recorded. `confirmation_claimed_at` is the
// claim, held by the one caller that is sending; `confirmation_sent_at` means delivered, and is
// set only after Resend accepted the email (or answered that it was already sent). A sender that
// dies mid-send leaves only a claim, which goes stale and can be taken again.

/**
 * A claim this old is abandoned: comfortably above a Vercel function's max duration, so the
 * first sender is gone.
 */
export const CLAIM_STALE_AFTER_MINUTES = 5;

/**
 * A stale claim is taken again only on a row paid this recently: inside Resend's 24 h idempotency
 * window, so re-sending an email that actually went out answers "duplicate", which the caller
 * treats as sent. A first claim is never time-limited.
 */
export const RECLAIM_WITHIN_HOURS = 23;

/**
 * Claim the right to send the confirmation email. Returns the registration to exactly one caller
 * (it must be paid, not yet delivered, and unclaimed or holding a stale claim); every other
 * caller gets null. Call `markConfirmationSent()` once the send succeeds, or
 * `releaseConfirmation()` if it fails so a retry can claim it again.
 */
export async function claimConfirmation(db: Db, id: string): Promise<Registration | null> {
  const [row] = await db
    .update(registrations)
    .set({ confirmationClaimedAt: sql`now()` })
    .where(
      and(
        eq(registrations.id, id),
        eq(registrations.status, "paid"),
        isNull(registrations.confirmationSentAt),
        or(
          isNull(registrations.confirmationClaimedAt),
          and(
            lt(
              registrations.confirmationClaimedAt,
              sql`now() - make_interval(mins => ${CLAIM_STALE_AFTER_MINUTES})`,
            ),
            gt(registrations.paidAt, sql`now() - make_interval(hours => ${RECLAIM_WITHIN_HOURS})`),
          ),
        ),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Record that the confirmation email was delivered. Returns whether the row changed: false if
 * it was already recorded. It doesn't require the claim, so a sender whose claim was taken over
 * still records its delivery.
 */
export async function markConfirmationSent(db: Db, id: string): Promise<boolean> {
  const rows = await db
    .update(registrations)
    .set({ confirmationSentAt: sql`now()` })
    .where(and(eq(registrations.id, id), isNull(registrations.confirmationSentAt)))
    .returning({ id: registrations.id });
  return rows.length > 0;
}

/**
 * Undo a `claimConfirmation()` after a failed send. Returns whether a claim was released; a
 * delivered row is never touched.
 */
export async function releaseConfirmation(db: Db, id: string): Promise<boolean> {
  const rows = await db
    .update(registrations)
    .set({ confirmationClaimedAt: null })
    .where(
      and(
        eq(registrations.id, id),
        isNotNull(registrations.confirmationClaimedAt),
        isNull(registrations.confirmationSentAt),
      ),
    )
    .returning({ id: registrations.id });
  return rows.length > 0;
}
