import type { Overview } from "@rr/db/admin";

const dayLabel = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** `2026-10-14` → `Oct 14`. The day is already race-local, so it's formatted as-is. */
function formatDay(day: string): string {
  return dayLabel.format(new Date(`${day}T00:00:00Z`));
}

const HEIGHT = 160;
const SLOT = 10;
const BAR = 8;
const RADIUS = 2;

/** A bar with rounded top corners, anchored to the baseline. */
function barPath(x: number, height: number): string {
  if (height <= 0) return "";
  const r = Math.min(RADIUS, height);
  const top = HEIGHT - height;
  return (
    `M${x},${HEIGHT}V${top + r}Q${x},${top} ${x + r},${top}` +
    `H${x + BAR - r}Q${x + BAR},${top} ${x + BAR},${top + r}V${HEIGHT}Z`
  );
}

/**
 * Paid registrations per day as one series of bars. Each day's column is a hover target with its
 * count, and the same numbers are in a table below for screen readers and exact reading.
 */
export function DailyChart({ daily }: { daily: Overview["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.paid));
  const width = daily.length * SLOT;
  const mid = daily[Math.floor(daily.length / 2)];

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="flex gap-2">
        <div
          aria-hidden="true"
          className="mono flex h-[160px] w-6 shrink-0 flex-col justify-between text-right text-line"
        >
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-[160px] w-full min-w-0"
          role="img"
          aria-label={`Paid registrations per day, ${formatDay(daily[0]!.day)} to ${formatDay(daily.at(-1)!.day)}. Busiest day: ${max}.`}
        >
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={0}
              x2={width}
              y1={HEIGHT * f}
              y2={HEIGHT * f}
              className="stroke-grid"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {daily.map((d, i) => {
            const label = `${formatDay(d.day)}: ${d.paid} paid`;
            return (
              <g key={d.day} className="group">
                <path
                  d={barPath(i * SLOT + (SLOT - BAR) / 2, (d.paid / max) * HEIGHT)}
                  className="fill-river-dark group-hover:fill-accent"
                />
                {/* Full-height hit target, wider than the bar. */}
                <rect x={i * SLOT} y={0} width={SLOT} height={HEIGHT} fill="transparent">
                  <title>{label}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
      <div aria-hidden="true" className="mono flex justify-between pl-8 text-line">
        <span>{formatDay(daily[0]!.day)}</span>
        {mid && <span>{formatDay(mid.day)}</span>}
        <span>{formatDay(daily.at(-1)!.day)}</span>
      </div>
      <figcaption className="text-sm text-line">
        Hover a day for its count. Days are in Manila time.
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Show as a table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full max-w-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-ink text-left">
                <th scope="col" className="py-1 pr-4">
                  Day
                </th>
                <th scope="col" className="py-1 text-right">
                  Paid
                </th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day} className="border-b border-rule">
                  <td className="py-1 pr-4">{formatDay(d.day)}</td>
                  <td className="py-1 text-right tabular-nums">{d.paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
