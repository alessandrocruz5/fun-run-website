import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";
import { baseEnvSchema, createEnv } from "@rr/env";
import { lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { z } from "zod";
import type { Db } from "./client";
import { RACES, type RaceId } from "./races";
import * as schema from "./schema";
import { authRateLimits, authSessions, registrations } from "./schema";

/**
 * Replaces every registration with fake ones for the dashboard demo: visitors' real registrations
 * are deleted too, which is how /privacy's weekly deletion happens. Also removes expired organizer
 * sessions (each demo sign-in leaves one) and every sign-in rate-limit entry (`<ip>|<path>` keys).
 *
 *   ALLOW_DEMO_SEED=1 pnpm --filter @rr/db seed:registrations
 *
 * Laptop only, as the Neon owner (`rr_app` and `rr_admin` can't delete). `ALLOW_DEMO_SEED` must be
 * on the command line: a value in packages/db/.env doesn't count.
 */

export const DEMO_SEED_COUNT = 300;
export const DEMO_SEED_DAYS = 60;

const seedEnvSchema = baseEnvSchema.extend({
  /** Direct (non-pooled) owner URL of the Neon branch to seed. Never set in Vercel. */
  MIGRATE_DATABASE_URL: z.url(),
});

/** Throws unless `ALLOW_DEMO_SEED=1`: the seed deletes every registration. */
export function assertDemoSeedAllowed(env: Record<string, string | undefined>): void {
  if (env.ALLOW_DEMO_SEED !== "1") {
    throw new Error(
      "seed:registrations deletes every registration. Run it with ALLOW_DEMO_SEED=1 on the command line.",
    );
  }
}

/** Deterministic PRNG (mulberry32), so a seed value always builds the same data. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function weighted<T extends string>(random: () => number, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  let roll = random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1]![0];
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

const FIRST_NAMES = {
  female: [
    "Andrea",
    "Bea",
    "Carla",
    "Dani",
    "Ella",
    "Gabby",
    "Isa",
    "Jasmine",
    "Kat",
    "Lara",
    "Mika",
    "Nina",
    "Pia",
    "Rina",
    "Sofia",
    "Trish",
    "Vina",
    "Yna",
  ],
  male: [
    "Aldo",
    "Ben",
    "Carlo",
    "Dindo",
    "Enzo",
    "Franco",
    "Gio",
    "Jun",
    "Kiko",
    "Luis",
    "Marco",
    "Nico",
    "Paolo",
    "Rafa",
    "Santi",
    "Tonio",
    "Vince",
    "Zandro",
  ],
} as const;

const LAST_NAMES = [
  "Abad",
  "Bautista",
  "Castillo",
  "Dizon",
  "Enriquez",
  "Flores",
  "Garcia",
  "Hernandez",
  "Ilagan",
  "Jimenez",
  "Lacson",
  "Mendoza",
  "Navarro",
  "Ocampo",
  "Pascual",
  "Quiambao",
  "Ramos",
  "Santos",
  "Tolentino",
  "Umali",
  "Villanueva",
  "Yap",
  "Zamora",
] as const;

const RACE_WEIGHTS: Record<RaceId, number> = { "5k": 35, "10k": 30, "21k": 22, "42k": 13 };
const STATUS_WEIGHTS = { paid: 82, pending: 10, cancelled: 8 } as const;
const SIZE_WEIGHTS = { XS: 6, S: 18, M: 30, L: 26, XL: 14, "2XL": 6 } as const;

/** PayMongo's published test-mode rates: a percentage plus, for cards, a fixed ₱15. */
const PAYMENT_METHODS = {
  gcash: { weight: 45, rate: 0.025, fixed: 0 },
  card: { weight: 25, rate: 0.035, fixed: 1_500 },
  paymaya: { weight: 20, rate: 0.02, fixed: 0 },
  grab_pay: { weight: 10, rate: 0.022, fixed: 0 },
} as const;
type PaymentMethod = keyof typeof PAYMENT_METHODS;

const DAY_MS = 86_400_000;

/**
 * A visibly fake number, `+63900000` + 4 digits: never a random one, which could belong to a real
 * subscriber. Runners get serials 0001-4999, emergency contacts 5001-9999.
 */
export const DEMO_MOBILE_PATTERN = /^\+63900000\d{4}$/;

function mobileNumber(serial: number): string {
  return `+63900000${String(serial).padStart(4, "0")}`;
}

function emailLocalPart(...parts: string[]): string {
  return parts
    .join(".")
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");
}

export type DemoSeedOptions = { count?: number; days?: number; now?: Date; seed?: number };

/**
 * Fake registrations at `@example.com` with `+63900000…` mobiles, created across the last `days` days (oldest first). Each
 * paid row has a test payment whose amount is the race's price from `RACES`.
 */
export function buildDemoRegistrations({
  count = DEMO_SEED_COUNT,
  days = DEMO_SEED_DAYS,
  now = new Date(),
  seed = 2027,
}: DemoSeedOptions = {}): (typeof registrations.$inferInsert)[] {
  if (count > 4_999) throw new Error("buildDemoRegistrations: at most 4,999 rows (mobile serials)");
  const random = prng(seed);
  // The newest row is at least half an hour old, so its payment and email are in the past too.
  const span = days * DAY_MS - 30 * 60_000;

  return Array.from({ length: count }, (_, i) => {
    // One slot per row, oldest first, jittered inside the slot: spread evenly over the window.
    const age = span * (1 - (i + random()) / count);
    const createdAt = new Date(now.getTime() - 30 * 60_000 - age);
    const race = weighted(random, RACE_WEIGHTS);
    const sex = random() < 0.5 ? "female" : "male";
    const firstName = pick(random, FIRST_NAMES[sex]);
    const lastName = pick(random, LAST_NAMES);
    // 15 to 66 years old, most between 30 and 50.
    const years = 15 + Math.floor(((random() + random()) / 2) * 52);
    const birthdate = new Date(
      createdAt.getTime() - years * 365.25 * DAY_MS - random() * 360 * DAY_MS,
    )
      .toISOString()
      .slice(0, 10);
    const status = weighted(random, STATUS_WEIGHTS);
    const amountCentavos = RACES[race].priceCentavos;
    const serial = String(i + 1).padStart(4, "0");

    const row: typeof registrations.$inferInsert = {
      race,
      firstName,
      lastName,
      email: `${emailLocalPart(firstName, lastName, serial)}@example.com`,
      mobile: mobileNumber(i + 1),
      birthdate,
      sex,
      shirtSize: weighted(random, SIZE_WEIGHTS),
      emergencyContactName: `${pick(random, FIRST_NAMES[random() < 0.5 ? "female" : "male"])} ${lastName}`,
      emergencyContactMobile: mobileNumber(5_000 + i + 1),
      consentAt: createdAt,
      amountCentavos,
      status,
      checkoutSessionId: `cs_seed_${serial}`,
      createdAt,
    };
    if (status !== "paid") return row;

    const method: PaymentMethod = weighted(
      random,
      Object.fromEntries(Object.entries(PAYMENT_METHODS).map(([k, v]) => [k, v.weight])) as Record<
        PaymentMethod,
        number
      >,
    );
    const { rate, fixed } = PAYMENT_METHODS[method];
    const feeCentavos = Math.round(amountCentavos * rate) + fixed;
    const paidAt = new Date(createdAt.getTime() + (2 + random() * 13) * 60_000);
    return {
      ...row,
      paymentId: `pay_seed_${serial}`,
      paymentMethod: method,
      feeCentavos,
      netCentavos: amountCentavos - feeCentavos,
      paidAt,
      confirmationSentAt: new Date(paidAt.getTime() + 5_000),
    };
  });
}

/**
 * Deletes every registration, expired organizer session and rate-limit entry, then inserts `rows`.
 */
export async function seedRegistrations(
  db: Db,
  rows: (typeof registrations.$inferInsert)[],
): Promise<void> {
  // Separate statements, so the same code runs on PGlite in tests. A failed run leaves fewer rows:
  // run it again.
  await db.delete(registrations);
  await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
  await db.delete(authRateLimits);
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(registrations).values(rows.slice(i, i + 100));
  }
}

async function main() {
  // Checked before .env is loaded, so only the command line can allow it.
  assertDemoSeedAllowed(process.env);
  if (existsSync(".env")) process.loadEnvFile(".env");
  const env = createEnv(seedEnvSchema);
  const db = drizzle({ client: neon(env.MIGRATE_DATABASE_URL), schema });
  const rows = buildDemoRegistrations();
  await seedRegistrations(db, rows);
  console.log(`seed:registrations: replaced all registrations with ${rows.length} demo rows.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
