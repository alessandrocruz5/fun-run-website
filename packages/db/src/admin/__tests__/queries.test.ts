import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../client";
import { RACE_IDS, RACES } from "../../races";
import * as schema from "../../schema";
import { registrations } from "../../schema";
import {
  assertDemoSeedAllowed,
  buildDemoRegistrations,
  DEMO_MOBILE_PATTERN,
  DEMO_SEED_COUNT,
  seedRegistrations,
} from "../../seed-registrations";
import {
  AGE_GROUPS,
  DAILY_WINDOW_DAYS,
  getOverview,
  listRegistrations,
  localDay,
  SHIRT_SIZES,
} from "../queries";

const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

const NOW = new Date("2026-10-14T04:00:00Z");
const DAY_MS = 86_400_000;
const seed = buildDemoRegistrations({ now: NOW });

let client: PGlite;
let db: Db;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  await seedRegistrations(db, seed);
});

// Every query runs as the dashboard's least-privilege role, as in production.
beforeEach(async () => {
  await client.exec("RESET ROLE; SET ROLE rr_admin;");
});

afterAll(async () => {
  await client.close();
});

/** Runs SQL as the owner: the independent check the queries are compared against. */
async function ownerQuery<T>(query: string): Promise<T[]> {
  await client.exec("RESET ROLE");
  try {
    return (await client.query<T>(query)).rows;
  } finally {
    await client.exec("SET ROLE rr_admin");
  }
}

describe("demo seed", () => {
  it("refuses to run without ALLOW_DEMO_SEED=1", () => {
    expect(() => assertDemoSeedAllowed({})).toThrow(/ALLOW_DEMO_SEED=1/);
    expect(() => assertDemoSeedAllowed({ ALLOW_DEMO_SEED: "true" })).toThrow();
    expect(() => assertDemoSeedAllowed({ ALLOW_DEMO_SEED: "0" })).toThrow();
    expect(() => assertDemoSeedAllowed({ ALLOW_DEMO_SEED: "1" })).not.toThrow();
  });

  it("builds 300 runners at unique @example.com addresses", () => {
    expect(seed).toHaveLength(DEMO_SEED_COUNT);
    const emails = seed.map((row) => row.email);
    for (const email of emails) expect(email).toMatch(/^[a-z0-9.]+@example\.com$/);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("uses visibly fake, unique mobile numbers, never random ones", () => {
    const mobiles = seed.flatMap((row) => [row.mobile, row.emergencyContactMobile]);
    for (const mobile of mobiles) expect(mobile).toMatch(DEMO_MOBILE_PATTERN);
    expect(new Set(mobiles).size).toBe(mobiles.length);
  });

  it("spreads registrations over the last 60 days", () => {
    const times = seed.map((row) => (row.createdAt as Date).getTime());
    const oldest = Math.min(...times);
    const newest = Math.max(...times);
    expect(oldest).toBeGreaterThanOrEqual(NOW.getTime() - 60 * DAY_MS);
    expect(oldest).toBeLessThan(NOW.getTime() - 59 * DAY_MS);
    expect(newest).toBeLessThan(NOW.getTime());
    expect(newest).toBeGreaterThan(NOW.getTime() - DAY_MS);
    const days = new Set(seed.map((row) => localDay(row.createdAt as Date)));
    expect(days.size).toBeGreaterThanOrEqual(55);
  });

  it("charges each paid runner the race's price, with fee + net = amount", () => {
    const paid = seed.filter((row) => row.status === "paid");
    expect(paid.length).toBeGreaterThan(200);
    expect(paid.length).toBeLessThan(DEMO_SEED_COUNT);
    for (const row of paid) {
      expect(row.amountCentavos).toBe(RACES[row.race].priceCentavos);
      expect(row.feeCentavos! + row.netCentavos!).toBe(row.amountCentavos);
      expect(row.paidAt!.getTime()).toBeLessThan(NOW.getTime());
    }
  });

  it("replaces every registration, expired sessions and rate-limit entries", async () => {
    const scratch = new PGlite();
    const scratchDb = drizzle({ client: scratch, schema });
    await migrate(scratchDb, { migrationsFolder });
    await seedRegistrations(scratchDb, seed.slice(0, 3));
    await scratch.exec(`
      INSERT INTO auth_users (id, name, email) VALUES ('u1', 'Demo', 'demo@example.test');
      INSERT INTO auth_sessions (id, token, user_id, expires_at) VALUES
        ('old', 'old-token', 'u1', now() - interval '1 hour'),
        ('live', 'live-token', 'u1', now() + interval '1 hour');
      INSERT INTO auth_rate_limits (id, key, count, last_request)
        VALUES ('r1', '198.51.100.1|/sign-in/email', 1, 0);`);

    await seedRegistrations(scratchDb, seed.slice(3, 8));

    const regs = await scratch.query<{ email: string }>("SELECT email FROM registrations");
    expect(regs.rows.map((x) => x.email).sort()).toEqual(
      seed
        .slice(3, 8)
        .map((x) => x.email)
        .sort(),
    );
    const sessions = await scratch.query<{ id: string }>("SELECT id FROM auth_sessions");
    expect(sessions.rows).toEqual([{ id: "live" }]);
    const limits = await scratch.query("SELECT 1 FROM auth_rate_limits");
    expect(limits.rows).toEqual([]);
    await scratch.close();
  });
});

describe("getOverview", () => {
  it("counts and sums only paid rows, per race, matching SQL", async () => {
    const overview = await getOverview(db, { now: NOW });
    const expected = await ownerQuery<{
      race: string;
      paid: number;
      gross: string;
      fees: string;
      net: string;
    }>(`SELECT race, count(*)::int AS paid, sum(amount_centavos) AS gross,
          sum(fee_centavos) AS fees, sum(net_centavos) AS net
        FROM registrations WHERE status = 'paid' GROUP BY race`);

    expect(overview.races.map((x) => x.race)).toEqual([...RACE_IDS]);
    for (const race of overview.races) {
      const row = expected.find((x) => x.race === race.race);
      expect(race).toEqual({
        race: race.race,
        paid: row?.paid ?? 0,
        grossCentavos: Number(row?.gross ?? 0),
        feeCentavos: Number(row?.fees ?? 0),
        netCentavos: Number(row?.net ?? 0),
      });
    }

    const [all] = await ownerQuery<{ paid: number; gross: string; everything: string }>(
      `SELECT count(*) FILTER (WHERE status = 'paid')::int AS paid,
         sum(amount_centavos) FILTER (WHERE status = 'paid') AS gross,
         sum(amount_centavos) AS everything FROM registrations`,
    );
    expect(overview.totals.paid).toBe(all!.paid);
    expect(overview.totals.grossCentavos).toBe(Number(all!.gross));
    // The seed has unpaid rows, so counting them would change the total.
    expect(overview.totals.grossCentavos).toBeLessThan(Number(all!.everything));
    expect(overview.totals.grossCentavos).toBe(
      overview.totals.feeCentavos + overview.totals.netCentavos,
    );
  });

  it("counts shirt sizes per race for paid runners, matching SQL", async () => {
    const overview = await getOverview(db, { now: NOW });
    const expected = await ownerQuery<{ race: string; size: string; n: number }>(
      `SELECT race, shirt_size AS size, count(*)::int AS n FROM registrations
        WHERE status = 'paid' GROUP BY race, shirt_size`,
    );
    for (const { race, sizes, total } of overview.shirtSizes) {
      for (const size of SHIRT_SIZES) {
        const n = expected.find((x) => x.race === race && x.size === size)?.n ?? 0;
        expect(sizes[size], `${race} ${size}`).toBe(n);
      }
      expect(total).toBe(overview.races.find((x) => x.race === race)!.paid);
    }
  });

  it("counts abandoned checkouts: cancelled, or unpaid for over 24 hours", async () => {
    const overview = await getOverview(db, { now: NOW });
    const [row] = await ownerQuery<{ n: number }>(
      `SELECT count(*)::int AS n FROM registrations WHERE status = 'cancelled'
        OR (status = 'pending' AND created_at < '${NOW.toISOString()}'::timestamptz - interval '24 hours')`,
    );
    expect(overview.abandoned).toBe(row!.n);
    expect(overview.abandoned).toBeGreaterThan(0);
  });

  it("zero-fills 60 Manila days of paid registrations, matching SQL", async () => {
    const overview = await getOverview(db, { now: NOW });
    expect(overview.daily).toHaveLength(DAILY_WINDOW_DAYS);
    expect(overview.daily.at(-1)?.day).toBe("2026-10-14");
    expect(overview.daily[0]?.day).toBe("2026-08-16");
    const expected = await ownerQuery<{ day: string; n: number }>(
      `SELECT to_char(created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day, count(*)::int AS n
        FROM registrations WHERE status = 'paid' GROUP BY 1`,
    );
    for (const { day, paid } of overview.daily) {
      expect(paid, day).toBe(expected.find((x) => x.day === day)?.n ?? 0);
    }
  });

  it("groups paid runners by age today, matching SQL", async () => {
    const overview = await getOverview(db, { now: NOW });
    const expected = await ownerQuery<{ age: number }>(
      `SELECT date_part('year', age(date '2026-10-14', birthdate))::int AS age
        FROM registrations WHERE status = 'paid'`,
    );
    const bounds = AGE_GROUPS.map((g, i) => [g.minAge, AGE_GROUPS[i + 1]?.minAge ?? Infinity]);
    expect(overview.ageGroups.map((g) => g.count)).toEqual(
      bounds.map(([min, max]) => expected.filter((x) => x.age >= min! && x.age < max!).length),
    );
    expect(overview.ageGroups.reduce((sum, g) => sum + g.count, 0)).toBe(overview.totals.paid);
  });
});

describe("listRegistrations", () => {
  const PERSONAL = [
    "email",
    "mobile",
    "birthdate",
    "emergencyContactName",
    "emergencyContactMobile",
  ] as const;

  it("never returns a viewer a raw email, mobile, birthdate or emergency contact", async () => {
    const result = await listRegistrations(db, "viewer", { pageSize: 1_000 });
    expect(result.rows).toHaveLength(DEMO_SEED_COUNT);
    const returned = JSON.stringify(result);
    for (const row of seed) {
      for (const field of PERSONAL) expect(returned).not.toContain(String(row[field]));
    }
    for (const row of result.rows) {
      expect(row.email).toMatch(/^[a-z]•••@example\.com$/);
      expect(row.mobile).toMatch(/^•••\d\d$/);
    }
  });

  it("returns the owner the raw values", async () => {
    const result = await listRegistrations(db, "owner", { pageSize: 1_000 });
    const byReference = new Map(result.rows.map((x) => [x.email, x]));
    for (const row of seed) expect(byReference.get(row.email)?.mobile).toBe(row.mobile);
  });

  it("searches email and mobile for the owner only", async () => {
    const target = seed[42]!;
    const owner = await listRegistrations(db, "owner", { q: target.email.toUpperCase() });
    expect(owner.rows.map((x) => x.firstName)).toEqual([target.firstName]);
    expect((await listRegistrations(db, "viewer", { q: target.email })).total).toBe(0);
    expect((await listRegistrations(db, "viewer", { q: target.mobile })).total).toBe(0);

    const local = `0${target.mobile.slice(3)}`;
    const byLocal = await listRegistrations(db, "owner", { q: local });
    expect(byLocal.rows.map((x) => x.mobile)).toEqual([target.mobile]);
    expect((await listRegistrations(db, "viewer", { q: local })).total).toBe(0);
  });

  it("never pages by zero or less", async () => {
    for (const pageSize of [0, Number.NaN]) {
      expect(await listRegistrations(db, "viewer", { pageSize })).toMatchObject({ pageSize: 25 });
    }
    const one = await listRegistrations(db, "viewer", { pageSize: -3 });
    expect(one).toMatchObject({ pageSize: 1, pageCount: DEMO_SEED_COUNT });
    expect(one.rows).toHaveLength(1);
  });

  it("searches name and reference for both roles", async () => {
    const owner = await listRegistrations(db, "owner", { pageSize: 1 });
    const { reference, firstName, lastName } = owner.rows[0]!;
    for (const role of ["owner", "viewer"] as const) {
      const byRef = await listRegistrations(db, role, { q: reference.toLowerCase() });
      expect(byRef.rows.map((x) => x.reference)).toEqual([reference]);
      const byName = await listRegistrations(db, role, { q: `${firstName} ${lastName}` });
      expect(byName.rows.map((x) => x.reference)).toContain(reference);
    }
  });

  it("treats LIKE wildcards in the search as text", async () => {
    expect((await listRegistrations(db, "owner", { q: "%" })).total).toBe(0);
    expect((await listRegistrations(db, "owner", { q: "_" })).total).toBe(0);
  });

  it("filters by race, status and shirt size, matching SQL", async () => {
    const result = await listRegistrations(db, "viewer", {
      race: "10k",
      status: "paid",
      size: "M",
      pageSize: 1_000,
    });
    const [row] = await ownerQuery<{ n: number }>(
      `SELECT count(*)::int AS n FROM registrations
        WHERE race = '10k' AND status = 'paid' AND shirt_size = 'M'`,
    );
    expect(result.total).toBe(row!.n);
    for (const x of result.rows)
      expect([x.race, x.status, x.shirtSize]).toEqual(["10k", "paid", "M"]);
  });

  it("sorts by the chosen column and direction", async () => {
    const byAmount = await listRegistrations(db, "viewer", { sort: "amount", dir: "asc" });
    const amounts = byAmount.rows.map((x) => x.amountCentavos);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));

    const newest = await listRegistrations(db, "viewer", {});
    const times = newest.rows.map((x) => x.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const byName = await listRegistrations(db, "viewer", { sort: "name", dir: "asc" });
    const names = byName.rows.map((x) => x.lastName.toLowerCase());
    expect(names).toEqual([...names].sort());
  });

  it("pages through every row once, and clamps a page past the end", async () => {
    const first = await listRegistrations(db, "viewer", { page: 1 });
    expect(first).toMatchObject({ total: DEMO_SEED_COUNT, page: 1, pageSize: 25, pageCount: 12 });
    const seen = new Set<string>();
    for (let page = 1; page <= first.pageCount; page += 1) {
      const result = await listRegistrations(db, "viewer", { page });
      for (const x of result.rows) seen.add(x.reference);
    }
    expect(seen.size).toBe(DEMO_SEED_COUNT);

    const past = await listRegistrations(db, "viewer", { page: 999 });
    expect(past.page).toBe(12);
    expect(past.rows).toHaveLength(DEMO_SEED_COUNT - 11 * 25);
  });

  it("returns an empty first page when nothing matches", async () => {
    const result = await listRegistrations(db, "viewer", { q: "no such runner" });
    expect(result).toEqual({ rows: [], total: 0, page: 1, pageCount: 1, pageSize: 25 });
  });
});

describe("getOverview at the boundaries", () => {
  let edge: PGlite;
  let edgeDb: Db;

  function row(overrides: Partial<typeof registrations.$inferInsert>) {
    const createdAt = overrides.createdAt ?? new Date("2026-10-01T00:00:00Z");
    return {
      race: "5k",
      firstName: "Edge",
      lastName: "Case",
      email: "edge@example.com",
      mobile: "+639000000000",
      birthdate: "1990-01-01",
      sex: "female",
      shirtSize: "M",
      emergencyContactName: "Edge Contact",
      emergencyContactMobile: "+639000005000",
      consentAt: createdAt,
      amountCentavos: RACES["5k"].priceCentavos,
      status: "paid",
      paidAt: createdAt,
      createdAt,
      ...overrides,
    } satisfies typeof registrations.$inferInsert;
  }

  beforeAll(async () => {
    edge = new PGlite();
    edgeDb = drizzle({ client: edge, schema });
    await migrate(edgeDb, { migrationsFolder });
    await edgeDb.insert(registrations).values([
      // Manila midnight is 16:00 UTC; the window opens at Manila midnight 59 days before today.
      row({ createdAt: new Date("2026-10-13T15:59:59Z") }),
      row({ createdAt: new Date("2026-10-13T16:00:00Z") }),
      row({ createdAt: new Date("2026-08-15T15:59:59Z") }),
      row({ createdAt: new Date("2026-08-15T16:00:00Z") }),
      // Birthdays on, before and after the 18 and 60 cutoffs, and either side of 29 Feb.
      row({ birthdate: "2008-10-14" }),
      row({ birthdate: "2008-10-15" }),
      row({ birthdate: "2008-10-13" }),
      row({ birthdate: "1966-10-14" }),
      row({ birthdate: "1966-10-15" }),
      row({ birthdate: "2010-02-28" }),
      row({ birthdate: "2010-03-01" }),
      // Unpaid for exactly 24 hours is not yet abandoned; a millisecond longer is.
      row({ status: "pending", paidAt: null, createdAt: new Date(NOW.getTime() - DAY_MS) }),
      row({ status: "pending", paidAt: null, createdAt: new Date(NOW.getTime() - DAY_MS - 1) }),
      row({ status: "pending", paidAt: null, createdAt: new Date(NOW.getTime() - 3_600_000) }),
      row({ status: "cancelled", paidAt: null, createdAt: new Date(NOW.getTime() - 3_600_000) }),
    ]);
    await edge.exec("SET ROLE rr_admin");
  });

  afterAll(async () => {
    await edge.close();
  });

  it("buckets days in Manila time and starts the window at Manila midnight", async () => {
    const { daily } = await getOverview(edgeDb, { now: NOW });
    const counts = Object.fromEntries(daily.filter((d) => d.paid).map((d) => [d.day, d.paid]));
    expect(counts).toEqual({ "2026-08-16": 1, "2026-10-01": 7, "2026-10-13": 1, "2026-10-14": 1 });
  });

  it("puts a runner in the older group on their birthday", async () => {
    const { ageGroups } = await getOverview(edgeDb, { now: NOW });
    expect(Object.fromEntries(ageGroups.map((g) => [g.label, g.count]))).toEqual({
      "Under 18": 3,
      "18–29": 2,
      "30–39": 4,
      "40–49": 0,
      "50–59": 1,
      "60+": 1,
    });
  });

  it("handles 29 February like Postgres age()", async () => {
    const { ageGroups } = await getOverview(edgeDb, { now: new Date("2028-02-29T04:00:00Z") });
    expect(Object.fromEntries(ageGroups.map((g) => [g.label, g.count]))).toEqual({
      "Under 18": 1,
      "18–29": 4,
      "30–39": 4,
      "40–49": 0,
      "50–59": 0,
      "60+": 2,
    });
    await edge.exec("RESET ROLE");
    const { rows } = await edge.query<{ age: number }>(
      `SELECT date_part('year', age(date '2028-02-29', birthdate))::int AS age FROM registrations
        WHERE birthdate IN ('2010-02-28', '2010-03-01') ORDER BY birthdate`,
    );
    await edge.exec("SET ROLE rr_admin");
    expect(rows.map((x) => x.age)).toEqual([18, 17]);
  });

  it("counts an unpaid checkout as abandoned only after more than 24 hours", async () => {
    const { abandoned } = await getOverview(edgeDb, { now: NOW });
    expect(abandoned).toBe(2);
  });
});
