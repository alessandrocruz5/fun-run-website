import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIST_PARAMS,
  hasFilters,
  listHref,
  parseListParams,
  sortHref,
} from "../search-params";

describe("parseListParams", () => {
  it("defaults to every registration, newest first, page 1", () => {
    expect(parseListParams({})).toEqual(DEFAULT_LIST_PARAMS);
    expect(hasFilters(parseListParams({}))).toBe(false);
  });

  it("reads valid values", () => {
    expect(
      parseListParams({
        q: "  dela cruz ",
        race: "21k",
        status: "paid",
        size: "2XL",
        sort: "name",
        dir: "asc",
        page: "3",
      }),
    ).toEqual({
      q: "dela cruz",
      race: "21k",
      status: "paid",
      size: "2XL",
      sort: "name",
      dir: "asc",
      page: 3,
    });
  });

  it("falls back to the default for anything unknown", () => {
    expect(
      parseListParams({
        race: "100k",
        status: "refunded",
        size: "xxl",
        sort: "email",
        dir: "sideways",
        page: "-2",
      }),
    ).toEqual(DEFAULT_LIST_PARAMS);
    for (const page of ["0", "1.5", "abc", "1e3", "9999999", ""]) {
      expect(parseListParams({ page }).page).toBe(1);
    }
  });

  it("takes the first of repeated values and caps the search", () => {
    expect(parseListParams({ race: ["5k", "42k"] }).race).toBe("5k");
    expect(parseListParams({ q: "a".repeat(500) }).q).toHaveLength(100);
  });

  it("counts search and filters as filtering, but not sort or page", () => {
    expect(hasFilters(parseListParams({ q: "x" }))).toBe(true);
    expect(hasFilters(parseListParams({ size: "M" }))).toBe(true);
    expect(hasFilters(parseListParams({ sort: "name", page: "2" }))).toBe(false);
  });
});

describe("listHref", () => {
  it("leaves defaults out of the URL", () => {
    expect(listHref(DEFAULT_LIST_PARAMS)).toBe("/registrations");
  });

  it("round-trips through parseListParams", () => {
    const params = parseListParams({
      q: "Juana & co",
      race: "10k",
      status: "pending",
      size: "S",
      sort: "amount",
      dir: "asc",
      page: "4",
    });
    const href = listHref(params);
    expect(href).toBe(
      "/registrations?q=Juana+%26+co&race=10k&status=pending&size=S&sort=amount&dir=asc&page=4",
    );
    const query = new URL(href, "http://localhost").searchParams;
    expect(parseListParams(Object.fromEntries(query))).toEqual(params);
  });

  it("applies a patch, e.g. the next page", () => {
    expect(listHref(parseListParams({ race: "5k" }), { page: 2 })).toBe(
      "/registrations?race=5k&page=2",
    );
  });
});

describe("sortHref", () => {
  it("starts a new column at its default direction and back on page 1", () => {
    const params = parseListParams({ page: "3" });
    expect(sortHref(params, "name")).toBe("/registrations?sort=name&dir=asc");
    expect(sortHref(params, "amount")).toBe("/registrations?sort=amount&dir=desc");
  });

  it("flips the direction of the current column", () => {
    expect(sortHref(DEFAULT_LIST_PARAMS, "created")).toBe("/registrations?sort=created&dir=asc");
    expect(sortHref(parseListParams({ sort: "created", dir: "asc" }), "created")).toBe(
      "/registrations",
    );
  });
});
