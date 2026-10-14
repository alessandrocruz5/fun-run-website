import { buttonClassName } from "@rr/ui";
import { REGISTRATION_STATUSES, SHIRT_SIZES } from "@rr/db/admin";
import { RACE_IDS, RACES } from "@rr/db/races";
import Form from "next/form";
import Link from "next/link";
import { hasFilters, LIST_PATH, type ListParams } from "@/lib/search-params";

const fieldClass =
  "h-11 min-w-0 rounded-input border-2 border-ink bg-field px-3 text-base font-normal text-ink";

/**
 * A GET form: submitting it navigates to the list's URL with the filters as query parameters, so
 * each search is a history entry and the back button returns to the previous one. Applying a
 * filter starts again at page 1; the current sort is kept.
 */
export function Filters({ params, searchable }: { params: ListParams; searchable: string }) {
  const keepSort = params.sort !== "created" || params.dir !== "desc";
  return (
    <Form
      action={LIST_PATH}
      role="search"
      aria-label="Search and filter registrations"
      className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] sm:items-end"
    >
      <label className="col-span-2 flex flex-col gap-1.5 text-sm font-semibold sm:col-span-1">
        Search
        <input
          type="search"
          name="q"
          defaultValue={params.q}
          maxLength={100}
          placeholder={searchable}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Race
        <select name="race" defaultValue={params.race ?? ""} className={fieldClass}>
          <option value="">All races</option>
          {RACE_IDS.map((id) => (
            <option key={id} value={id}>
              {RACES[id].label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Status
        <select name="status" defaultValue={params.status ?? ""} className={fieldClass}>
          <option value="">Any status</option>
          {REGISTRATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status[0]!.toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Shirt
        <select name="size" defaultValue={params.size ?? ""} className={fieldClass}>
          <option value="">Any size</option>
          {SHIRT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      {keepSort && (
        <>
          <input type="hidden" name="sort" value={params.sort} />
          <input type="hidden" name="dir" value={params.dir} />
        </>
      )}
      <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
        <button type="submit" className={buttonClassName({ variant: "dark", size: "sm" })}>
          Apply
        </button>
        {hasFilters(params) && (
          <Link href={LIST_PATH} className="text-sm font-semibold underline underline-offset-4">
            Clear
          </Link>
        )}
      </div>
    </Form>
  );
}
