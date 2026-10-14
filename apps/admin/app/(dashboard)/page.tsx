import { getDb } from "@rr/db";
import { ABANDONED_AFTER_HOURS, DAILY_WINDOW_DAYS, getOverview } from "@rr/db/admin";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DailyChart } from "@/components/daily-chart";
import { RaceBreakdown } from "@/components/race-breakdown";
import { ShirtSizes } from "@/components/shirt-sizes";
import { formatCount, formatPeso, StatCard } from "@/components/stat-card";
import { canSeePersonalData } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Overview" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <h2 id={id} className="m-0 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Totals for the organizer. Like every page, it checks the session itself. */
export default async function OverviewPage() {
  const session = await requireSession();
  const overview = await getOverview(getDb());
  const { totals } = overview;
  const maxAge = Math.max(1, ...overview.ageGroups.map((g) => g.count));

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-10 px-4 py-8 sm:px-7 sm:py-10">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="disp text-4xl">Overview</h1>
          <Link href="/registrations" className="font-semibold underline underline-offset-4">
            All registrations →
          </Link>
        </div>
        <p className="m-0 max-w-[60ch]">
          {canSeePersonalData(session.role)
            ? "You see registrations in full."
            : "You're exploring the demo: runners' email, mobile, birthdate and emergency contact are masked."}{" "}
          Money and runner counts include paid registrations only.
        </p>
      </div>

      <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Paid runners" value={formatCount(totals.paid)} />
        <StatCard label="Gross" value={formatPeso(totals.grossCentavos)} />
        <StatCard label="PayMongo fees" value={formatPeso(totals.feeCentavos)} />
        <StatCard label="Net" value={formatPeso(totals.netCentavos)} />
        <StatCard
          label="Abandoned"
          value={formatCount(overview.abandoned)}
          note={`Cancelled, or unpaid after ${ABANDONED_AFTER_HOURS} hours`}
        />
      </dl>

      <Section title="By race">
        <RaceBreakdown races={overview.races} totals={totals} />
      </Section>

      <Section title={`Paid registrations per day, last ${DAILY_WINDOW_DAYS} days`}>
        <DailyChart daily={overview.daily} />
      </Section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Section title="Age groups">
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {overview.ageGroups.map((g) => (
              <li
                key={g.label}
                className="grid grid-cols-[5rem_minmax(0,1fr)_3rem] items-center gap-3"
              >
                <span>{g.label}</span>
                <span aria-hidden="true" className="h-3 rounded-r-[4px] bg-grid">
                  <span
                    className="block h-full rounded-r-[4px] bg-river-dark"
                    style={{ width: `${(g.count / maxAge) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{formatCount(g.count)}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-sm text-line">Paid runners, by age today.</p>
        </Section>

        <Section title="Shirt sizes">
          <ShirtSizes rows={overview.shirtSizes} />
        </Section>
      </div>
    </main>
  );
}
