---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 05
unit: FRW-17
status: done
model: sonnet
effort: high
depends_on: [04]
parallel_group: C
files:
  create: ["apps/admin/src/lib/auth/__tests__/role-passthrough.test.ts"]
  modify: []
  delete: []
---
# 05 · Test that the dashboard pages pass `session.role` to the masked query

## Task
Add a test-only regression guard (open since FRW-11/12): the registrations list page and the registration detail page must call the masked queries with the signed-in organizer's role from `requireSession()`, never a literal. A viewer's data is masked in the query layer by that argument, so a hard-coded `"owner"` would leak personal data to the public demo and nothing would fail today.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Admin app `apps/admin` (Vitest 5; tests beside code in `__tests__/`; `@/` alias = `apps/admin/src`). This file is in a high-stakes glob (`apps/admin/src/lib/auth/**`) but is test-only: **do not change any production file**.
- Pages under test (default exports, async server components):
  - `apps/admin/app/(dashboard)/registrations/page.tsx`: `RegistrationsPage({ searchParams })`: `const session = await requireSession(); … listRegistrations(getDb(), session.role, params)`.
  - `apps/admin/app/(dashboard)/registrations/[reference]/page.tsx`: after prompt 04 the props are `{ params: Promise<{reference}>, searchParams: Promise<SearchParams> }`: `getRegistration(getDb(), session.role, reference)`.
  - The export route is already covered by `.../export/__tests__/route.test.ts` ("queries as the session's role"): don't repeat it.
  - The overview page (`(dashboard)/page.tsx`) calls `getOverview(getDb())`, which takes no role (aggregates only): out of scope.
- Pattern to copy: `apps/admin/app/(dashboard)/registrations/export/__tests__/route.test.ts:1-35`: `vi.hoisted` mocks; `vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }))`; `vi.mock("@rr/db", () => ({ getDb: () => "db" }))`; `vi.mock("@rr/db/admin", async (importOriginal) => ({ ...(await importOriginal<object>()), listRegistrations: mocks.listRegistrations, getRegistration: mocks.getRegistration }))`.
- Import the pages with relative paths as `session.test.ts` does (`../../../../app/(dashboard)/page`): from `apps/admin/src/lib/auth/__tests__/` that is `../../../../app/(dashboard)/registrations/page` and `…/[reference]/page`.
- Calling an async server component as a function returns a React element tree; the child components are not rendered, which is enough. `listRegistrations` must resolve a minimal list (`{ rows: [], total: 0, page: 1, pageCount: 1, pageSize: 25 }`) and `getRegistration` a minimal row or `null` (a `null` makes the page call `notFound()`, which throws: assert that with `rejects.toThrow()` for the not-found case, and give a full row for the happy path using the shape in `packages/db/src/admin/queries.ts:285-311`: read it and fake only the fields the page reads).
- Cases (for each of `owner` and `viewer`, via `it.each`): the list page → `listRegistrations` called with `("db", role, expect.objectContaining({ page: 1 }))`; the detail page → `getRegistration` called with `("db", role, "RR-AAAAAAA1")`. Also: when `requireSession` rejects (redirect), neither query is called.
- Also add a mutation-style sanity check in your head, not in code: changing `session.role` to `"owner"` in either page must make a test fail.
- Scope: create only the one test file.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Edit any production code or the existing `session.test.ts`.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @rr/admin test
```
- Temporarily change `session.role` to `"owner"` in `registrations/page.tsx`: the viewer case fails. Revert it before finishing (`git diff --stat` shows only the new test file).
