---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 04
unit: FRW-17
status: done
model: sonnet
effort: high
depends_on: [03]
parallel_group: B
files:
  create: []
  modify:
    - "apps/admin/src/lib/search-params.ts"
    - "apps/admin/src/lib/__tests__/search-params.test.ts"
    - "apps/admin/src/components/registrations-table.tsx"
    - "apps/admin/app/(dashboard)/registrations/[reference]/page.tsx"
  delete: []
---
# 04 · Detail links keep the list's filters and stop prefetching

## Task
Two FRW-12 findings:
1. The reference links in the registrations list prefetch every row's detail page (a session lookup each). Turn prefetch off.
2. The detail page's "← Registrations" link always goes to `/registrations`, losing the search, filters, sort and page the organizer came from. Carry the list state in the link and restore it.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Admin app `apps/admin` (Next 16.4). Read `apps/admin/AGENTS.md` and the `Link` docs under `apps/admin/node_modules/next/dist/docs/` for the current `prefetch` prop before editing.
- `apps/admin/src/lib/search-params.ts`: `ListParams` type (line 282), `LIST_PATH = "/registrations"`, `parseListParams(params)` (line 322: whitelists everything; unknown values fall back to defaults, `q` is trimmed and capped), `listHref(params, patch?)` (line 342: the list's URL, defaults left out), `exportHref`, `sortHref`.
  Add `export function detailHref(params: ListParams, reference: string): string` returning `${LIST_PATH}/${encodeURIComponent(reference)}` plus the same query string `listHref(params)` builds (reuse it: `const query = listHref(params).split("?")[1]`, exactly like `exportHref` at line 359 does), or no `?` when there is none.
- `apps/admin/src/components/registrations-table.tsx`: `ReferenceLink({ reference })` (line 36) renders `<Link href={`${LIST_PATH}/${reference}`} className="underline underline-offset-4">`; it is used twice (lines 95 and 144: table and phone cards). The component already receives the list `params` (it calls `sortHref(params, sort)` at line 63): thread `params` into `ReferenceLink` (prop `params: ListParams`), use `detailHref(params, reference)` and add `prefetch={false}`.
- `apps/admin/app/(dashboard)/registrations/[reference]/page.tsx`: props today `{ params }: { params: Promise<{ reference: string }> }` (line ~56); first statement is `const session = await requireSession();` (keep it first). The back link is `<Link href={LIST_PATH} …>← Registrations</Link>` (line 71). Add `searchParams: Promise<SearchParams>` to the props (same type and import as `registrations/page.tsx:15-20`), `const list = parseListParams(await searchParams);` and `href={listHref(list)}`. Only whitelisted values ever reach the link: nothing from the URL is echoed raw. Keep `getRegistration(getDb(), session.role, reference)` exactly as is.
- Tests: `apps/admin/src/lib/__tests__/search-params.test.ts` (121 lines): add `detailHref` cases (plain list → `/registrations/RR-AAAAAAA1`; with `q`, `race`, `sort`/`dir`, `page` → matching query; a hostile `q=<script>`/`race=bogus` parsed through `parseListParams` first yields no `race` and a plain encoded `q`; the reference is URL-encoded).
- Review constraints: organizer access (`requireSession()` first), nothing from the URL trusted: only `parseListParams`'s whitelisted output is turned back into a URL.
- Scope: only the four listed files. Don't change `registrations/page.tsx`, the filters or pagination.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @rr/admin test
pnpm build
```
- `grep -n 'prefetch' apps/admin/src/components/registrations-table.tsx` shows `prefetch={false}` on the reference link.
- A detail URL such as `/registrations/RR-AAAAAAA1?q=dela&race=5k` renders a back link to `/registrations?q=dela&race=5k` (covered by a `detailHref`/`listHref` round-trip test).
