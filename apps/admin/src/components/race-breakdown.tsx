import type { Overview } from "@rr/db/admin";
import { RACES, type RaceId } from "@rr/db/races";
import { formatCount, formatPeso } from "./stat-card";

/** "5K" on a phone, "5K Fun Run" from the `sm` breakpoint up. */
export function RaceName({ race }: { race: RaceId }) {
  return (
    <>
      <span className="sm:hidden">{race.toUpperCase()}</span>
      <span className="hidden sm:inline">{RACES[race].label}</span>
    </>
  );
}

/** Paid registrations and money per race. Only paid rows count. */
export function RaceBreakdown({ races, totals }: Pick<Overview, "races" | "totals">) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs sm:text-sm">
        <caption className="sr-only">Paid registrations and revenue per race</caption>
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th scope="col" className="py-2 pr-2 sm:pr-4 font-semibold">
              Race
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-semibold sm:pl-4">
              Paid
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-semibold sm:pl-4">
              Gross
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-semibold sm:pl-4">
              <span className="sm:hidden">Fees</span>
              <span className="hidden sm:inline">PayMongo fees</span>
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-semibold sm:pl-4">
              Net
            </th>
          </tr>
        </thead>
        <tbody>
          {races.map((x) => (
            <tr key={x.race} className="border-b border-rule">
              <th scope="row" className="py-2.5 pr-2 sm:pr-4 text-left font-medium">
                <RaceName race={x.race} />
              </th>
              <td className="py-2.5 pl-2 sm:pl-4 text-right tabular-nums">{formatCount(x.paid)}</td>
              <td className="py-2.5 pl-2 sm:pl-4 text-right tabular-nums">
                {formatPeso(x.grossCentavos)}
              </td>
              <td className="py-2.5 pl-2 sm:pl-4 text-right tabular-nums">
                {formatPeso(x.feeCentavos)}
              </td>
              <td className="py-2.5 pl-2 sm:pl-4 text-right tabular-nums">
                {formatPeso(x.netCentavos)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <th scope="row" className="py-2.5 pr-2 sm:pr-4 text-left">
              Total
            </th>
            <td className="py-2.5 pl-2 sm:pl-4 text-right tabular-nums">
              {formatCount(totals.paid)}
            </td>
            <td className="py-2.5 pl-2 sm:pl-4 text-right tabular-nums">
              {formatPeso(totals.grossCentavos)}
            </td>
            <td className="py-2.5 pl-2 sm:pl-4 text-right tabular-nums">
              {formatPeso(totals.feeCentavos)}
            </td>
            <td className="py-2.5 pl-2 sm:pl-4 text-right tabular-nums">
              {formatPeso(totals.netCentavos)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
