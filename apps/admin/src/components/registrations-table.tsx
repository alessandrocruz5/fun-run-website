import {
  type RegistrationListRow,
  type RegistrationStatus,
  type SortKey,
  TIME_ZONE,
} from "@rr/db/admin";
import { RACES } from "@rr/db/races";
import Link from "next/link";
import { type ListParams, sortHref } from "@/lib/search-params";
import { formatPeso } from "./stat-card";

const registeredAt = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const STATUS_STYLE: Record<RegistrationStatus, string> = {
  paid: "bg-ink text-paper",
  pending: "border-[1.5px] border-ink text-ink",
  cancelled: "border-[1.5px] border-dashed border-line text-line",
};

function Status({ status }: { status: RegistrationStatus }) {
  return (
    <span
      className={`mono inline-block rounded-full px-2.5 py-1.5 uppercase ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

function SortHeader({
  params,
  sort,
  label,
  align = "left",
}: {
  params: ListParams;
  sort: SortKey;
  label: string;
  align?: "left" | "right";
}) {
  const active = params.sort === sort;
  const ariaSort = active ? (params.dir === "asc" ? "ascending" : "descending") : undefined;
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`py-2 font-semibold ${align === "right" ? "pl-4 text-right" : "pr-4 text-left"}`}
    >
      <Link href={sortHref(params, sort)} className="no-underline hover:underline">
        {label}
        <span aria-hidden="true" className="ml-1 text-line">
          {active ? (params.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}

/**
 * One page of registrations: a table from the `md` breakpoint up, a list of cards on a phone.
 * Email and mobile are shown exactly as the query returned them, masked for a viewer.
 */
export function RegistrationsTable({
  rows,
  params,
}: {
  rows: RegistrationListRow[];
  params: ListParams;
}) {
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
        {rows.map((row) => (
          <li key={row.reference} className="rounded-option border-2 border-ink bg-field p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 font-semibold break-words">
                  {row.firstName} {row.lastName}
                </p>
                <p className="mono m-0 mt-1.5 text-line">{row.reference}</p>
              </div>
              <Status status={row.status} />
            </div>
            <dl className="m-0 mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              <dt className="text-line">Race</dt>
              <dd className="m-0">
                {RACES[row.race].label} · {row.shirtSize}
              </dd>
              <dt className="text-line">Amount</dt>
              <dd className="m-0 tabular-nums">{formatPeso(row.amountCentavos)}</dd>
              <dt className="text-line">Email</dt>
              <dd className="m-0 break-all">{row.email}</dd>
              <dt className="text-line">Mobile</dt>
              <dd className="m-0">{row.mobile}</dd>
              <dt className="text-line">Registered</dt>
              <dd className="m-0">{registeredAt.format(row.createdAt)}</dd>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Registrations, sorted by {params.sort}</caption>
          <thead>
            <tr className="border-b-2 border-ink">
              <SortHeader params={params} sort="name" label="Runner" />
              <th scope="col" className="py-2 pr-4 text-left font-semibold">
                Contact
              </th>
              <SortHeader params={params} sort="race" label="Race" />
              <th scope="col" className="py-2 pr-4 text-left font-semibold">
                Shirt
              </th>
              <SortHeader params={params} sort="status" label="Status" />
              <SortHeader params={params} sort="amount" label="Amount" align="right" />
              <SortHeader params={params} sort="created" label="Registered" align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.reference} className="border-b border-rule align-top">
                <td className="py-3 pr-4">
                  <span className="font-semibold">
                    {row.firstName} {row.lastName}
                  </span>
                  <span className="mono mt-1.5 block text-line">{row.reference}</span>
                </td>
                <td className="py-3 pr-4">
                  <span className="block break-all">{row.email}</span>
                  <span className="block text-line">{row.mobile}</span>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">{RACES[row.race].label}</td>
                <td className="py-3 pr-4 font-semibold">{row.shirtSize}</td>
                <td className="py-3 pr-4">
                  <Status status={row.status} />
                </td>
                <td className="py-3 pl-4 text-right tabular-nums">
                  {formatPeso(row.amountCentavos)}
                </td>
                <td className="py-3 pl-4 text-right whitespace-nowrap">
                  {registeredAt.format(row.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
