import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { RACE_IDS } from "../races";

export const raceEnum = pgEnum("race", RACE_IDS);

export const registrationStatusEnum = pgEnum("registration_status", [
  "pending",
  "paid",
  "cancelled",
]);

export const sexEnum = pgEnum("sex", ["male", "female"]);

export const shirtSizeEnum = pgEnum("shirt_size", ["XS", "S", "M", "L", "XL", "2XL"]);

// Crockford base32 without I, L, O, U: easy to read aloud and to type. 32 divides 256, so taking
// each random byte mod 32 is unbiased.
const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const REFERENCE_LENGTH = 8;

/** A random, non-sequential booking reference such as `RR-7K3QX9TD` (40 bits of entropy). */
export function generateReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REFERENCE_LENGTH));
  let code = "";
  for (const byte of bytes) code += REFERENCE_ALPHABET[byte % 32];
  return `RR-${code}`;
}

export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().unique().$defaultFn(generateReference),
    race: raceEnum("race").notNull(),

    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    mobile: text("mobile").notNull(),
    birthdate: date("birthdate").notNull(),
    sex: sexEnum("sex").notNull(),
    shirtSize: shirtSizeEnum("shirt_size").notNull(),
    emergencyContactName: text("emergency_contact_name").notNull(),
    emergencyContactMobile: text("emergency_contact_mobile").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),

    /** Price snapshot from `RACES` at registration time. */
    amountCentavos: integer("amount_centavos").notNull(),
    status: registrationStatusEnum("status").notNull().default("pending"),
    checkoutSessionId: text("checkout_session_id").unique(),
    paymentId: text("payment_id").unique(),
    paymentMethod: text("payment_method"),
    feeCentavos: integer("fee_centavos"),
    netCentavos: integer("net_centavos"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** One-shot email claim: set before sending, cleared again if the send fails. */
    confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("registrations_amount_positive", sql`${t.amountCentavos} > 0`),
    check("registrations_paid_has_paid_at", sql`${t.status} <> 'paid' OR ${t.paidAt} IS NOT NULL`),
    index("registrations_status_idx").on(t.status),
    index("registrations_race_idx").on(t.race),
    index("registrations_created_at_idx").on(t.createdAt),
  ],
);

export type Registration = typeof registrations.$inferSelect;
