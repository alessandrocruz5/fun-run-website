import type { ReactNode } from "react";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const integer = new Intl.NumberFormat("en-PH");

/** `123450` centavos → `₱1,234.50`. Shared by the stat cards and the dashboard's tables. */
export function formatPeso(centavos: number): string {
  return peso.format(centavos / 100);
}

export function formatCount(n: number): string {
  return integer.format(n);
}

/** One headline number on the overview. */
export function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-option border-2 border-ink bg-field p-3 sm:p-5">
      <dt className="mono uppercase tracking-[.08em]">{label}</dt>
      <dd className="disp m-0 text-lg break-words tabular-nums [font-stretch:100%] sm:text-3xl sm:[font-stretch:110%]">
        {value}
      </dd>
      {note && <dd className="m-0 text-sm text-line">{note}</dd>}
    </div>
  );
}
