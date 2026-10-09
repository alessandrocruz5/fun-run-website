import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
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

/**
 * Claim the right to send the confirmation email. Returns the registration to exactly one caller
 * (it must be paid and not yet claimed); every other caller gets null. Call
 * `releaseConfirmation()` if the send fails so a retry can claim it again.
 */
export async function claimConfirmation(db: Db, id: string): Promise<Registration | null> {
  const [row] = await db
    .update(registrations)
    .set({ confirmationSentAt: sql`now()` })
    .where(
      and(
        eq(registrations.id, id),
        eq(registrations.status, "paid"),
        isNull(registrations.confirmationSentAt),
      ),
    )
    .returning();
  return row ?? null;
}

/** Undo a `claimConfirmation()` after a failed send. Returns whether a claim was released. */
export async function releaseConfirmation(db: Db, id: string): Promise<boolean> {
  const rows = await db
    .update(registrations)
    .set({ confirmationSentAt: null })
    .where(and(eq(registrations.id, id), isNotNull(registrations.confirmationSentAt)))
    .returning({ id: registrations.id });
  return rows.length > 0;
}
