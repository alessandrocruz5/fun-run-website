import {
  MAX_SEARCH_LENGTH,
  REGISTRATION_STATUSES,
  type RegistrationStatus,
  SHIRT_SIZES,
  type ShirtSize,
  SORT_KEYS,
  type SortDir,
  type SortKey,
} from "@rr/db/admin";
import { isRaceId, type RaceId } from "@rr/db/races";

/**
 * The registrations list keeps its search, filters, sort and page in the URL, so a view can be
 * shared or bookmarked and the back button steps through it. Anything unknown in the URL falls
 * back to the default: a value is only ever matched against these lists, never echoed into SQL.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export type ListParams = {
  q: string;
  race: RaceId | null;
  status: RegistrationStatus | null;
  size: ShirtSize | null;
  sort: SortKey;
  dir: SortDir;
  page: number;
};

export const LIST_PATH = "/registrations";

export const DEFAULT_LIST_PARAMS: ListParams = {
  q: "",
  race: null,
  status: null,
  size: null,
  sort: "created",
  dir: "desc",
  page: 1,
};

/** Text columns read A→Z first; dates and amounts newest/largest first. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  created: "desc",
  name: "asc",
  race: "asc",
  status: "asc",
  amount: "desc",
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function oneOf<T extends string>(values: readonly T[], value: string): T | null {
  return (values as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseListParams(params: SearchParams): ListParams {
  const race = first(params.race);
  const page = first(params.page);
  return {
    q: first(params.q).trim().slice(0, MAX_SEARCH_LENGTH),
    race: isRaceId(race) ? race : null,
    status: oneOf(REGISTRATION_STATUSES, first(params.status)),
    size: oneOf(SHIRT_SIZES, first(params.size)),
    sort: oneOf(SORT_KEYS, first(params.sort)) ?? DEFAULT_LIST_PARAMS.sort,
    dir: oneOf(["asc", "desc"] as const, first(params.dir)) ?? DEFAULT_LIST_PARAMS.dir,
    page: /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 1,
  };
}

/** Whether any search or filter narrows the list (sorting and paging don't). */
export function hasFilters(params: ListParams): boolean {
  return Boolean(params.q || params.race || params.status || params.size);
}

/** The list's URL with `patch` applied. Defaults are left out, so the plain list is `/registrations`. */
export function listHref(params: ListParams, patch: Partial<ListParams> = {}): string {
  const next = { ...params, ...patch };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.race) query.set("race", next.race);
  if (next.status) query.set("status", next.status);
  if (next.size) query.set("size", next.size);
  if (next.sort !== DEFAULT_LIST_PARAMS.sort || next.dir !== DEFAULT_LIST_PARAMS.dir) {
    query.set("sort", next.sort);
    query.set("dir", next.dir);
  }
  if (next.page > 1) query.set("page", String(next.page));
  const search = query.toString();
  return search ? `${LIST_PATH}?${search}` : LIST_PATH;
}

/** The link behind a column header: flips the direction of the current sort, else its default. */
export function sortHref(params: ListParams, sort: SortKey): string {
  const dir = params.sort === sort ? (params.dir === "asc" ? "desc" : "asc") : DEFAULT_DIR[sort];
  return listHref(params, { sort, dir, page: 1 });
}
