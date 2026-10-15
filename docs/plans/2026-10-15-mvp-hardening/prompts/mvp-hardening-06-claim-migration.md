---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 06
unit: FRW-18
status: done
model: opus
effort: xhigh
depends_on: []
parallel_group: A
files:
  create:
    - "packages/db/drizzle/0004_confirmation_claim.sql"
    - "packages/db/drizzle/meta/0004_snapshot.json"
  modify:
    - "packages/db/drizzle/meta/_journal.json"
    - "packages/db/src/schema/registrations.ts"
    - "packages/db/src/registrations.ts"
    - "packages/db/src/__tests__/registrations.test.ts"
    - "packages/db/src/__tests__/grants.test.ts"  # added at build, user-approved: migration count 4 → 5
    - "apps/web/src/lib/registration/__tests__/confirm.test.ts"
    - "apps/web/app/api/webhooks/paymongo/__tests__/route.test.ts"
    - "apps/web/src/lib/registration/__tests__/actions.test.ts"
  delete: []
---
# 06 · Split the email claim from delivery: migration 0004 and the db functions

## Task
Today `claimConfirmation()` stamps `registrations.confirmation_sent_at` *before* sending, and it is kept after a successful send. A function killed mid-send therefore leaves a row that says "sent" with no email, recoverable only by manual SQL. Add a separate nullable `confirmation_claimed_at` column for the claim, make `confirmation_sent_at` mean **delivered**, and let a stale claim be re-claimed safely. This prompt is the database layer only; prompt 07 changes the caller.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Package `packages/db` (`@rr/db`, Drizzle + Neon HTTP, tests on PGlite). **High-stakes path** (`packages/db/**`): migrations are expand/contract and an applied migration is never edited: `0000`–`0003` stay untouched. Only the owner runs migrations (from a laptop); you only generate the files and run them on PGlite in tests.
- Schema: `packages/db/src/schema/registrations.ts:247-248`:
  ```ts
  /** One-shot email claim: set before sending, cleared again if the send fails. */
  confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
  ```
  Add beside it `confirmationClaimedAt: timestamp("confirmation_claimed_at", { withTimezone: true })` and rewrite both comments: `confirmationClaimedAt` = "taken by the caller that is sending the email; cleared if the send fails; may be taken again once stale (see `claimConfirmation`)"; `confirmationSentAt` = "set only after Resend accepted the email (or reported it already sent)".
- Migration: generate it, don't hand-write the snapshot: `pnpm --filter @rr/db db:generate` (drizzle-kit, no DB needed; config `packages/db/drizzle.config.ts`). Name it so the file is `0004_confirmation_claim.sql` (use `--name confirmation_claim` if drizzle-kit supports it, else rename the file *and* the journal tag consistently before anything is applied). The SQL must be exactly an additive nullable column: `ALTER TABLE "registrations" ADD COLUMN "confirmation_claimed_at" timestamp with time zone;`. Check `meta/_journal.json` gained one entry and `meta/0004_snapshot.json` exists. No backfill and no grant statement: `rr_app` has table-level `SELECT, INSERT, UPDATE` on `registrations` (`0001_app_role.sql`), which covers a new column, and `rr_admin` keeps `SELECT`. `packages/db/src/__tests__/grants.test.ts` must still pass unchanged.
- Functions in `packages/db/src/registrations.ts` (lines 152-180, imports `and, eq, isNotNull, isNull, ne, sql`). Rewrite the section's comment and implement:
  - `claimConfirmation(db, id)`: `UPDATE … SET confirmation_claimed_at = now()` `WHERE id = $id AND status = 'paid' AND confirmation_sent_at IS NULL AND (confirmation_claimed_at IS NULL OR (confirmation_claimed_at < now() - interval '5 minutes' AND paid_at > now() - interval '23 hours'))` `RETURNING *`; returns the row to exactly one caller, else `null`. Export two constants next to it: `CLAIM_STALE_AFTER_MINUTES = 5` (comfortably above a Vercel function's max duration, so the first sender is gone) and `RECLAIM_WITHIN_HOURS = 23` (inside Resend's 24 h idempotency window: a re-send of a send that actually went out answers "duplicate", which the caller already treats as sent). Build the interval with `sql` from the constants (`sql\`now() - make_interval(mins => ${CLAIM_STALE_AFTER_MINUTES})\``), not a string-concatenated literal. Use `lt`/`gt` from `drizzle-orm` as needed.
  - `markConfirmationSent(db, id): Promise<boolean>`: `SET confirmation_sent_at = now() WHERE id = $id AND confirmation_sent_at IS NULL`; returns whether a row changed. (Does not require the claim: a late call after a reclaim must still record delivery.)
  - `releaseConfirmation(db, id): Promise<boolean>`: `SET confirmation_claimed_at = NULL WHERE id = $id AND confirmation_claimed_at IS NOT NULL AND confirmation_sent_at IS NULL`; returns whether a claim was released (never touches a delivered row).
  - Export `markConfirmationSent` from the package barrel if `claimConfirmation` is exported there (`packages/db/src/index.ts` is 5 lines: check how the others are re-exported: if it is `export * from "./registrations"` nothing to do; if not, **stop and report** instead of editing `index.ts`, which isn't in this prompt's files).
  - Every function stays one conditional statement (no transactions: the Neon HTTP driver has none), and errors name no personal data.
- Tests: extend `packages/db/src/__tests__/registrations.test.ts` (PGlite migrated from `packages/db/drizzle`; each test runs as `rr_app` after `TRUNCATE`; see the existing `describe("claimConfirmation / releaseConfirmation")` at line 240 and the helpers at the top: `runner`, `createPending`, `markPaid`). Update the existing four tests to the new semantics and add: claim sets `confirmation_claimed_at` and leaves `confirmation_sent_at` null; a second claim right after returns `null`; a claim older than 5 min (move it back as the owner: `await client.exec("RESET ROLE; UPDATE registrations SET confirmation_claimed_at = now() - interval '6 minutes'; SET ROLE rr_app;")`) can be claimed again exactly once; a claim 4 min old cannot; a stale claim on a row whose `paid_at` is older than 23 h cannot be re-claimed, but an *unclaimed* row paid 30 h ago still can (first claims are never time-limited); `markConfirmationSent` sets it once and returns false the second time; a row with `confirmation_sent_at` set can't be claimed or released; `releaseConfirmation` clears a claim and returns false when none. Add one concurrency test: `Promise.all` of 5 `claimConfirmation` calls on one paid row → exactly one non-null. Add a schema test that the column exists and is nullable (see `describe("schema")` at line 87 for how columns/indexes are checked).
- **Keep the repo green on its own.** `Registration` (`$inferSelect`) gains `confirmationClaimedAt`, and three web test fixtures are typed `Registration` and list every column: `confirm.test.ts:35` (`row()`, the list ends `confirmationSentAt: null` at line 58), `app/api/webhooks/paymongo/__tests__/route.test.ts:36` (`row()`, line 59) and `actions.test.ts:62` (`pendingRow()`, line 85). Add `confirmationClaimedAt: null,` next to `confirmationSentAt: null,` in each, and change nothing else in those files (prompt 07 does the real test work there). Then `pnpm typecheck` must pass for the whole repo.
- Review constraints: database roles (no new grant, no DDL by an app role), migrations expand-only and never edited, price and payment status untouched, no personal data in errors.
- Scope: the listed files only. Don't touch `seed-registrations.ts` (it sets `confirmationSentAt` for paid seed rows, which stays correct: delivered).

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Edit `0000`–`0003` or their snapshots, or hand-edit a generated snapshot beyond what drizzle-kit wrote.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Run the migration against Neon or any real database.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @rr/db test
pnpm build
```
- `git status` shows `0004_confirmation_claim.sql`, `meta/0004_snapshot.json` and an updated `_journal.json`; `git diff packages/db/drizzle/0000_init.sql packages/db/drizzle/0001_app_role.sql packages/db/drizzle/0002_auth.sql packages/db/drizzle/0003_admin_role.sql` is empty.
- `pnpm --filter @rr/db db:generate` run again reports no further changes (schema and snapshot agree).
- `pnpm test` and `pnpm typecheck` pass for the whole repo (not only `@rr/db`): `claimConfirmation` and `releaseConfirmation` keep their signatures, so `apps/web` keeps building.
- Report that migration `0004` must be applied to Neon `dev` (as the owner, from the laptop) before the unit's preview deploy is checked: the web app's confirm path needs the column.
