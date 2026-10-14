import { and, asc, count, desc, eq, gte, ilike, lt, ne, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "../client";
import { RACE_IDS, type RaceId } from "../races";
import {
  type OrganizerRole,
  registrations,
  registrationStatusEnum,
  shirtSizeEnum,
} from "../schema";
import { canUnmask, personalDataColumns } from "./mask";

/**
 * Read-only queries for the organizer dashboard (`apps/admin`), which connects as `rr_admin`.
 * Callers check the session first and pass its role; personal data is masked by role in the
 * query itself (./mask.ts), never only in the UI.
 */

export { canUnmask, MASK } from "./mask";

export const SHIRT_SIZES = shirtSizeEnum.enumValues;
export type ShirtSize = (typeof SHIRT_SIZES)[number];

export const REGISTRATION_STATUSES = registrationStatusEnum.enumValues;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/** Dates on the dashboard are race-local. Manila has no daylight saving time. */
export const TIME_ZONE = "Asia/Manila";
const UTC_OFFSET = "+08:00";

/** A checkout still unpaid after this long (or cancelled) counts as abandoned. */
export const ABANDONED_AFTER_HOURS = 24;

/** How many days "registrations per day" covers, today included. */
export const DAILY_WINDOW_DAYS = 60;

export const AGE_GROUPS = [
  { label: "Under 18", minAge: 0 },
  { label: "18–29", minAge: 18 },
  { label: "30–39", minAge: 30 },
  { label: "40–49", minAge: 40 },
  { label: "50–59", minAge: 50 },
  { label: "60+", minAge: 60 },
] as const;

export type Money = { grossCentavos: number; feeCentavos: number; netCentavos: number };
export type RaceTotals = Money & { race: RaceId; paid: number };

export type Overview = {
  /** Paid registrations and money per race, in `RACE_IDS` order. Only paid rows count. */
  races: RaceTotals[];
  totals: Money & { paid: number };
  abandoned: number;
  /** Paid registrations per race-local day of registration, oldest first, zero-filled. */
  daily: { day: string; paid: number }[];
  /** Paid runners by age today, in `AGE_GROUPS` order. */
  ageGroups: { label: string; count: number }[];
  /** Paid runners' shirt sizes per race. */
  shirtSizes: { race: RaceId; sizes: Record<ShirtSize, number>; total: number }[];
};

const r = registrations;
const isPaid = eq(r.status, "paid");

/** `sum()` is a bigint, which the drivers return as a string. */
function sumOf(column: typeof r.amountCentavos | typeof r.feeCentavos | typeof r.netCentavos) {
  return sql`coalesce(sum(${column}), 0)`.mapWith(Number);
}

const localDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` in race-local time. */
export function localDay(date: Date): string {
  return localDayFormat.format(date);
}

/** The race-local date `years` years before `day`, as `YYYY-MM-DD` (29 Feb → 28 Feb). */
function yearsBefore(day: string, years: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y - years, m, 0)).getUTCDate();
  const date = new Date(Date.UTC(y - years, m - 1, Math.min(d, lastDay)));
  return date.toISOString().slice(0, 10);
}

/** Aggregates only: the overview holds no personal data for either role. */
export async function getOverview(db: Db, { now = new Date() }: { now?: Date } = {}) {
  const today = localDay(now);
  const days = Array.from({ length: DAILY_WINDOW_DAYS }, (_, i) =>
    localDay(new Date(now.getTime() - (DAILY_WINDOW_DAYS - 1 - i) * 86_400_000)),
  );
  const windowStart = new Date(`${days[0]}T00:00:00${UTC_OFFSET}`);
  const abandonedBefore = new Date(now.getTime() - ABANDONED_AFTER_HOURS * 3_600_000);
  // A runner is at least N years old when born on or before this date.
  const cutoffs = AGE_GROUPS.map((g) => yearsBefore(today, g.minAge));
  // TIME_ZONE as a literal, not a parameter, so GROUP BY can repeat the expression verbatim.
  const createdDay = sql<string>`to_char(${r.createdAt} at time zone 'Asia/Manila', 'YYYY-MM-DD')`;

  const [raceRows, [abandonedRow], dailyRows, [ageRow], sizeRows] = await Promise.all([
    db
      .select({
        race: r.race,
        paid: count(),
        grossCentavos: sumOf(r.amountCentavos),
        feeCentavos: sumOf(r.feeCentavos),
        netCentavos: sumOf(r.netCentavos),
      })
      .from(r)
      .where(isPaid)
      .groupBy(r.race),
    db
      .select({ count: count() })
      .from(r)
      .where(
        and(ne(r.status, "paid"), or(eq(r.status, "cancelled"), lt(r.createdAt, abandonedBefore))),
      ),
    db
      .select({ day: createdDay, paid: count() })
      .from(r)
      .where(and(isPaid, gte(r.createdAt, windowStart)))
      .groupBy(createdDay),
    db
      .select(
        Object.fromEntries(
          AGE_GROUPS.map((group, i) => {
            const older = cutoffs[i + 1];
            const inGroup = older
              ? sql`${r.birthdate} <= ${cutoffs[i]} and ${r.birthdate} > ${older}`
              : sql`${r.birthdate} <= ${cutoffs[i]}`;
            return [group.label, sql`count(*) filter (where ${inGroup})`.mapWith(Number)];
          }),
        ) as Record<string, SQL<number>>,
      )
      .from(r)
      .where(isPaid),
    db
      .select({ race: r.race, size: r.shirtSize, count: count() })
      .from(r)
      .where(isPaid)
      .groupBy(r.race, r.shirtSize),
  ]);

  const races: RaceTotals[] = RACE_IDS.map((race) => {
    const row = raceRows.find((x) => x.race === race);
    return {
      race,
      paid: row?.paid ?? 0,
      grossCentavos: row?.grossCentavos ?? 0,
      feeCentavos: row?.feeCentavos ?? 0,
      netCentavos: row?.netCentavos ?? 0,
    };
  });
  const totals = races.reduce(
    (sum, x) => ({
      paid: sum.paid + x.paid,
      grossCentavos: sum.grossCentavos + x.grossCentavos,
      feeCentavos: sum.feeCentavos + x.feeCentavos,
      netCentavos: sum.netCentavos + x.netCentavos,
    }),
    { paid: 0, grossCentavos: 0, feeCentavos: 0, netCentavos: 0 },
  );
  const perDay = new Map(dailyRows.map((x) => [x.day, x.paid]));

  return {
    races,
    totals,
    abandoned: abandonedRow?.count ?? 0,
    daily: days.map((day) => ({ day, paid: perDay.get(day) ?? 0 })),
    ageGroups: AGE_GROUPS.map((g) => ({ label: g.label, count: ageRow?.[g.label] ?? 0 })),
    shirtSizes: RACE_IDS.map((race) => {
      const sizes = Object.fromEntries(SHIRT_SIZES.map((s) => [s, 0])) as Record<ShirtSize, number>;
      for (const row of sizeRows) if (row.race === race) sizes[row.size] = row.count;
      return { race, sizes, total: Object.values(sizes).reduce((a, b) => a + b, 0) };
    }),
  } satisfies Overview;
}

export const SORT_KEYS = ["created", "name", "race", "status", "amount"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export const PAGE_SIZE = 25;

/** Search terms are capped so a long query string can't become an expensive pattern. */
export const MAX_SEARCH_LENGTH = 100;

export type RegistrationListFilters = {
  q?: string;
  race?: RaceId | null;
  status?: RegistrationStatus | null;
  size?: ShirtSize | null;
  sort?: SortKey;
  dir?: SortDir;
  /** 1-based; past the last page means the last page. */
  page?: number;
  pageSize?: number;
};

const SORT_COLUMNS: Record<SortKey, SQL[]> = {
  created: [sql`${r.createdAt}`],
  name: [sql`lower(${r.lastName})`, sql`lower(${r.firstName})`],
  race: [sql`${r.race}`],
  status: [sql`${r.status}`],
  amount: [sql`${r.amountCentavos}`],
};

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * One page of registrations, filtered and sorted. A viewer's email and mobile come back masked by
 * Postgres, and a viewer's search matches only the reference and name: searching the masked
 * columns would tell a viewer whether a given address or number is registered.
 */
export async function listRegistrations(
  db: Db,
  role: OrganizerRole,
  filters: RegistrationListFilters = {},
) {
  const pageSize = Math.max(1, Math.trunc(filters.pageSize ?? PAGE_SIZE) || PAGE_SIZE);
  const term = filters.q?.trim().slice(0, MAX_SEARCH_LENGTH);
  const conditions: SQL[] = [];
  if (filters.race) conditions.push(eq(r.race, filters.race));
  if (filters.status) conditions.push(eq(r.status, filters.status));
  if (filters.size) conditions.push(eq(r.shirtSize, filters.size));
  if (term) {
    const pattern = likePattern(term);
    const matches = [
      ilike(r.reference, pattern),
      ilike(sql`${r.firstName} || ' ' || ${r.lastName}`, pattern),
    ];
    if (canUnmask(role)) {
      matches.push(ilike(r.email, pattern), ilike(r.mobile, pattern));
      // Mobiles are stored as +63…; let `0917…` find them too.
      if (/^0\d/.test(term)) matches.push(ilike(r.mobile, likePattern(`+63${term.slice(1)}`)));
    }
    conditions.push(or(...matches) as SQL);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(r).where(where);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(filters.page ?? 1) || 1), pageCount);

  const direction = filters.dir === "asc" ? asc : desc;
  const order = [...SORT_COLUMNS[filters.sort ?? "created"].map((c) => direction(c)), asc(r.id)];
  const { email, mobile } = personalDataColumns(role);

  const rows = await db
    .select({
      reference: r.reference,
      race: r.race,
      firstName: r.firstName,
      lastName: r.lastName,
      email,
      mobile,
      shirtSize: r.shirtSize,
      status: r.status,
      amountCentavos: r.amountCentavos,
      paymentMethod: r.paymentMethod,
      paidAt: r.paidAt,
      confirmationSentAt: r.confirmationSentAt,
      createdAt: r.createdAt,
    })
    .from(r)
    .where(where)
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total, page, pageCount, pageSize };
}

export type RegistrationList = Awaited<ReturnType<typeof listRegistrations>>;
export type RegistrationListRow = RegistrationList["rows"][number];

/**
 * One registration for the detail page, or null. Like the list, a viewer gets email and mobile
 * masked by Postgres, and a null birthdate and emergency contact.
 */
export async function getRegistration(db: Db, role: OrganizerRole, reference: string) {
  const [row] = await db
    .select({
      reference: r.reference,
      race: r.race,
      firstName: r.firstName,
      lastName: r.lastName,
      ...personalDataColumns(role),
      shirtSize: r.shirtSize,
      consentAt: r.consentAt,
      status: r.status,
      amountCentavos: r.amountCentavos,
      feeCentavos: r.feeCentavos,
      netCentavos: r.netCentavos,
      paymentMethod: r.paymentMethod,
      paymentId: r.paymentId,
      paidAt: r.paidAt,
      confirmationSentAt: r.confirmationSentAt,
      createdAt: r.createdAt,
    })
    .from(r)
    .where(eq(r.reference, reference))
    .limit(1);
  return row ?? null;
}

export type RegistrationDetail = NonNullable<Awaited<ReturnType<typeof getRegistration>>>;
