---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 07
unit: FRW-18
status: done
model: opus
effort: xhigh
depends_on: [06]
parallel_group: B
files:
  create: []
  modify:
    - "apps/web/src/lib/registration/confirm.ts"
    - "apps/web/src/lib/registration/__tests__/confirm.test.ts"
    - "apps/web/app/api/webhooks/paymongo/__tests__/route.test.ts"
    - "apps/web/src/lib/registration/__tests__/actions.test.ts"
    - "docs/runbook.md"
    - "packages/db/README.md"
  delete: []
---
# 07 · `sendConfirmation()` records delivery, and a stuck claim heals itself

## Task
Use the new `markConfirmationSent()` from prompt 06: after the confirmation email is accepted (or Resend reports it already sent), record delivery in `confirmation_sent_at`. A claim taken by a function that died is re-claimed by the next webhook retry or success-page reload after 5 minutes (the SQL rule is in `claimConfirmation()`). The one-email guarantee must keep holding.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. **High-stakes** (`apps/web/src/lib/registration/**`, the payment-confirmation path). Read prompt 06's result first: `packages/db/src/registrations.ts` now has `claimConfirmation` (sets `confirmation_claimed_at`, re-claimable when stale), `markConfirmationSent(db, id): Promise<boolean>` and `releaseConfirmation` (clears the claim only while unsent). `Registration` has both `confirmationClaimedAt` and `confirmationSentAt`.
- `apps/web/src/lib/registration/confirm.ts:116-138` `sendConfirmation(db, registration)` today: returns early when `status !== "paid" || confirmationSentAt`; `claimConfirmation`; `sendRegistrationConfirmed(...)`; on `duplicate` logs `email.duplicate`; on failure logs `email.send_failed`, `releaseConfirmation`, rethrows (and logs `email.release_failed` if release fails). Imports from `@rr/db` at the top (lines 1-10).
  New flow: early return unchanged (it now means "delivered"); claim; send; **on success (including `duplicate`) call `markConfirmationSent(db, claimed.id)`**; if that call throws, `logError("email.mark_sent_failed", error, ids)` and do **not** rethrow (the email is out; a later reclaim re-sends, Resend answers `duplicate`, and the mark is retried). A failed send keeps today's behaviour exactly (log, release, rethrow). Update the doc comments on `sendConfirmation` and at the top of the file ("claims the row … and keeps the claim") to describe claim vs delivered and the 5 min / 23 h reclaim.
- Tests: three files mock `@rr/db` by `importOriginal` plus `vi.fn()` for the db functions: `__tests__/confirm.test.ts:17-24`, `app/api/webhooks/paymongo/__tests__/route.test.ts:~22-23` and `__tests__/actions.test.ts` (grep `claimConfirmation`). Add `markConfirmationSent: vi.fn()` to each mock (default `mockResolvedValue(true)`), otherwise the real function runs against the fake db and fails.
  In `confirm.test.ts` the `describe("confirmation email")` block (line 338) emulates the row in memory using `current.confirmationSentAt` as the claim (lines ~347-380). Rework that emulation to track `confirmationClaimedAt` (claim) and `confirmationSentAt` (delivered) the way the SQL does, then keep the existing assertions: **"sends exactly one email when the webhook, the success page and retries all fire" (line 444) must still pass unchanged in meaning**. Add: after a successful send `markConfirmationSent` is called once with `(db, ROW_ID)`; a `duplicate` result also marks it; a failed send does not mark and releases; `markConfirmationSent` rejecting → the call resolves `paid`, `email.mark_sent_failed` logged by ID only (assert the logged object has no email/name), no release; a stale claim being reclaimed (make the claim mock return the row again after a first caller "died" between claim and send) sends once more, and Resend's idempotency key is still the registration ID.
  Existing tests at lines 559-583 ("never sends for a row that isn't paid", "doesn't claim again for a row whose email already went out", "doesn't send when another caller holds the claim") stay valid: don't weaken them.
- Docs: `docs/runbook.md` → `## Email (Resend)` (lines 213-254): update "When it is sent" (the row is claimed in `confirmation_claimed_at`, `confirmation_sent_at` is set only after Resend accepts it), add the self-heal rule (a claim older than 5 minutes on an unsent row that was paid under 23 hours ago is retried by the next webhook retry or success-page load), rewrite **Stuck claim**: new rows heal by themselves; the manual SQL now clears `confirmation_claimed_at` (and applies to rows paid more than 23 hours ago or stuck from before migration `0004`, whose `confirmation_sent_at` is set with no email: `UPDATE registrations SET confirmation_sent_at = NULL, confirmation_claimed_at = NULL WHERE reference = '<RR-…>' AND status = 'paid';`). Also note the migration must be applied (runbook `## Migrations`) **before** this deploy. `packages/db/README.md:30-31`: update the two function rows and add `markConfirmationSent`.
- Review constraints: email only after payment, exactly once; payment status only from the server; no personal data in logs (IDs, status, codes only).
- Scope: the listed files only. `webhook route.ts`, `actions.ts` and the success page are unchanged.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Remove or loosen any existing test.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
- The "exactly one email" test still passes; a test proves a stale claim is re-sent once; a test proves a mark failure doesn't fail the confirmation.
- `grep -n 'confirmation_sent_at' docs/runbook.md` shows no sentence that calls it the claim.
