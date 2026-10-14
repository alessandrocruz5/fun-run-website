import { getDb } from "@rr/db";
import { listRegistrations } from "@rr/db/admin";
import type { Metadata } from "next";
import Link from "next/link";
import { Filters } from "@/components/filters";
import { Pagination } from "@/components/pagination";
import { RegistrationsTable } from "@/components/registrations-table";
import { canSeePersonalData } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { hasFilters, LIST_PATH, parseListParams, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Registrations" };

/**
 * Every registration, searchable and filterable, with the state in the URL. The query masks a
 * viewer's contact details; this page shows what it returns.
 */
export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  const params = parseListParams(await searchParams);
  const list = await listRegistrations(getDb(), session.role, params);
  // The query clamps a page past the end; show the page it actually returned.
  const shown = { ...params, page: list.page };
  const unmasked = canSeePersonalData(session.role);

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-8 sm:px-7 sm:py-10">
      <div className="flex flex-col gap-3">
        <Link href="/" className="text-sm font-semibold underline underline-offset-4">
          ← Overview
        </Link>
        <h1 className="disp text-4xl">Registrations</h1>
        {!unmasked && (
          <p className="m-0 max-w-[60ch] text-sm">
            Demo view: email and mobile are masked, and search matches names and references only.
          </p>
        )}
      </div>

      {/* Keyed by the URL, so Back and Clear reset the form's fields to the URL's values. */}
      <Filters
        key={JSON.stringify(params)}
        params={shown}
        searchable={unmasked ? "Name, reference, email or mobile" : "Name or reference"}
      />

      {list.total === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-option border-2 border-dashed border-line px-5 py-10">
          <p className="m-0 text-lg font-semibold">
            {hasFilters(params) ? "No registrations match." : "No registrations yet."}
          </p>
          <p className="m-0 text-sm">
            {hasFilters(params)
              ? "Try another search or fewer filters."
              : "Runners appear here once they start registering."}
          </p>
          {hasFilters(params) && (
            <Link href={LIST_PATH} className="font-semibold underline underline-offset-4">
              Clear search and filters
            </Link>
          )}
        </div>
      ) : (
        <>
          <RegistrationsTable rows={list.rows} params={shown} />
          <Pagination
            params={shown}
            page={list.page}
            pageCount={list.pageCount}
            pageSize={list.pageSize}
            total={list.total}
          />
        </>
      )}
    </main>
  );
}
