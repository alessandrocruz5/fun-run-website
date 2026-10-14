import { type Overview, SHIRT_SIZES } from "@rr/db/admin";
import { RaceName } from "./race-breakdown";
import { formatCount } from "./stat-card";

/** Shirts to order: paid runners per race and size, with totals per size. */
export function ShirtSizes({ rows }: { rows: Overview["shirtSizes"] }) {
  const sizeTotals = SHIRT_SIZES.map((size) => rows.reduce((sum, x) => sum + x.sizes[size], 0));
  const total = rows.reduce((sum, x) => sum + x.total, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs sm:text-sm">
        <caption className="sr-only">Shirt sizes of paid runners, per race</caption>
        <thead>
          <tr className="border-b-2 border-ink">
            <th scope="col" className="py-2 pr-2 sm:pr-4 text-left font-semibold">
              Race
            </th>
            {SHIRT_SIZES.map((size) => (
              <th key={size} scope="col" className="mono py-2 pl-2 sm:pl-3 text-right">
                {size}
              </th>
            ))}
            <th scope="col" className="py-2 pl-2 sm:pl-4 text-right font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.race} className="border-b border-rule">
              <th scope="row" className="py-2.5 pr-2 sm:pr-4 text-left font-medium">
                <RaceName race={x.race} />
              </th>
              {SHIRT_SIZES.map((size) => (
                <td key={size} className="py-2.5 pl-2 sm:pl-3 text-right tabular-nums">
                  {formatCount(x.sizes[size])}
                </td>
              ))}
              <td className="py-2.5 pl-2 sm:pl-4 text-right font-semibold tabular-nums">
                {formatCount(x.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <th scope="row" className="py-2.5 pr-2 sm:pr-4 text-left">
              All races
            </th>
            {sizeTotals.map((n, i) => (
              <td key={SHIRT_SIZES[i]} className="py-2.5 pl-2 sm:pl-3 text-right tabular-nums">
                {formatCount(n)}
              </td>
            ))}
            <td className="py-2.5 pl-2 sm:pl-4 text-right tabular-nums">{formatCount(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
