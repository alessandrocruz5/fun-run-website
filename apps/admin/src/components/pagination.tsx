import { buttonClassName } from "@rr/ui";
import Link from "next/link";
import { listHref, type ListParams } from "@/lib/search-params";
import { formatCount } from "./stat-card";

/** Previous / next links that keep the filters and sort. Disabled ends are plain text. */
export function Pagination({
  params,
  page,
  pageCount,
  pageSize,
  total,
}: {
  params: ListParams;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const linkClass = buttonClassName({ variant: "outline", size: "sm" });
  const disabledClass = `${linkClass} pointer-events-none opacity-40`;

  return (
    <nav
      aria-label="Pages"
      className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink pt-4"
    >
      <p className="m-0 text-sm" aria-live="polite">
        {formatCount(from)}–{formatCount(to)} of {formatCount(total)} · page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={listHref(params, { page: page - 1 })} rel="prev" className={linkClass}>
            ← Previous
          </Link>
        ) : (
          <span aria-disabled="true" className={disabledClass}>
            ← Previous
          </span>
        )}
        {page < pageCount ? (
          <Link href={listHref(params, { page: page + 1 })} rel="next" className={linkClass}>
            Next →
          </Link>
        ) : (
          <span aria-disabled="true" className={disabledClass}>
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
