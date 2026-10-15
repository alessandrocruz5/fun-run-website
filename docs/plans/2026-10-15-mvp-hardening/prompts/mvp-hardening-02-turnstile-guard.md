---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 02
unit: FRW-16
status: done
model: opus
effort: high
depends_on: []
parallel_group: A
files:
  create:
    - "apps/web/src/lib/registration/fields.ts"
    - "apps/web/src/components/__tests__/registration-form.test.tsx"
  modify:
    - "apps/web/src/lib/registration/turnstile.ts"
    - "apps/web/src/lib/registration/__tests__/turnstile.test.ts"
    - "apps/web/src/components/registration-form.tsx"
    - "apps/web/.env.example"
    - "docs/runbook.md"
  delete: []
---
# 02 · Refuse Turnstile test keys in production; share the honeypot field name

## Task
Two open code-guardian findings from FRW-7:
1. Nothing stops Cloudflare's always-pass dummy secret (`1x0000000000000000000000000000000AA`) being deployed to production, which would switch the bot check off. Refuse any Cloudflare dummy key when `VERCEL_ENV === "production"`.
2. The honeypot name `fax_number` is a literal in two places (`registration-form.tsx:12` and `turnstile.ts:123`) with no test that they match. Give it one home that the client form can import.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Web app: `apps/web` (Next 16.4, Vitest 5, tests beside code in `__tests__/`; `@/` alias maps to `apps/web/src`). Before writing Next/React code read `apps/web/node_modules/next/dist/docs/` where relevant (see `apps/admin/AGENTS.md`).
- `apps/web/src/lib/registration/turnstile.ts`: exports `TURNSTILE_FIELD = "cf-turnstile-response"` (line 117), `HONEYPOT_FIELD = "fax_number"` (line 123), `getTurnstileSiteKey(source?)` (line 138, returns the key or `null` after `logError("turnstile.site_key_missing", …)`), `verifyTurnstile(token, source?)` (line 173). `secretEnvSchema`/`siteEnvSchema` are `baseEnvSchema.extend({...})` (lines 130-131). `verifyTurnstile` returns `{ok:false, reason:"unavailable"}` when the env is invalid, logging via `logError` from `./confirm` (which logs error class and env key names only, never values).
- `apps/web/src/lib/registration/actions.ts:10` imports `HONEYPOT_FIELD, TURNSTILE_FIELD, verifyTurnstile` from `./turnstile`: keep that working.
- `apps/web/src/components/registration-form.tsx`: client component; line 12 `const HONEYPOT_FIELD = "fax_number";`, line 396 `<input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />`. Its imports from `schema.ts` are type-only on purpose (line 10 comment: zod stays out of the browser). So the shared constants go in a **new dependency-free module `fields.ts`** (no imports at all), which the form imports as a value. Don't import `turnstile.ts` from the form: it pulls server code (`confirm.ts` → `@rr/db`, `@rr/email`).
- Design (decided):
  - `fields.ts` exports `TURNSTILE_FIELD` and `HONEYPOT_FIELD` with their existing doc comments moved over. `turnstile.ts` does `export { HONEYPOT_FIELD, TURNSTILE_FIELD } from "./fields";` and imports what it uses; the form imports `HONEYPOT_FIELD` from `@/lib/registration/fields`.
  - Cloudflare's dummy keys all match `/^[123]x0{10}/` (site keys `1x00000000000000000000AA`, secrets `1x0000…AA`, etc.); real keys start `0x4`. Add `const TEST_KEY = /^[123]x0{10}/;` and an exported helper `isTurnstileTestKey(value: string): boolean`.
  - Production = `VERCEL_ENV === "production"` (Vercel sets it to `production`, `preview` or `development`; `NODE_ENV` is `production` in Preview and in CI's `next start`, so don't use it). Add `VERCEL_ENV: z.string().optional()` to both schemas via `.extend`, read from the same `source` argument as the other keys (so tests pass it through `source`).
  - `verifyTurnstile`: after the secret parses, if it is a test key and `VERCEL_ENV === "production"` → `console.error("turnstile.test_key_in_production", { key: "TURNSTILE_SECRET_KEY" })` (key name only), return `{ ok: false, reason: "unavailable" }` before any fetch. `getTurnstileSiteKey`: same condition on `TURNSTILE_SITE_KEY` → log `turnstile.test_key_in_production` with the key name and return `null` (the form then says registration is paused). Outside production (dev, Preview, CI) test keys keep working: the existing tests rely on them.
- Existing tests to copy: `apps/web/src/lib/registration/__tests__/turnstile.test.ts` (Cloudflare `1x`/`2x`/`3x` answers replayed with a mocked `fetch`; no network). Add cases: production + `1x…`, `2x…` and `3x…` secrets → `unavailable` and `fetch` not called; production + a realistic secret (`0x4AAAAAAAtest0000000000000000000`) → proceeds to fetch as before; `VERCEL_ENV=preview` + `1x…` → still ok; site key: production + `1x00000000000000000000AA` → `null`; preview → returned; `isTurnstileTestKey` truth table.
- New test `apps/web/src/components/__tests__/registration-form.test.tsx`: render `RegistrationForm` with `renderToStaticMarkup` from `react-dom/server` (look at `apps/web/src/lib/registration/__tests__/actions.test.ts` and `packages/ui/src/components/components.test.tsx` for how components are rendered in tests; mock `@/lib/registration/actions` if importing it drags in server modules, as `register` is a server action) and assert the markup contains `name="fax_number"`-equivalent via `HONEYPOT_FIELD` imported from `turnstile.ts` (the server side), so renaming it in only one place fails. Also assert the existing server tests in `actions.test.ts` still pass (they use the literal `fax_number`; leave them).
- Props needed by `RegistrationForm` are in `sections/register.tsx:26-34` (`races`, `shirtSizes`, `sexes`, `initialRace`, `turnstileSiteKey`); build minimal fixtures from `apps/web/src/content/site.ts` (`getRaceView`) and `SEXES`/`SHIRT_SIZES` from `schema.ts`.
- Docs: `apps/web/.env.example` (Turnstile block, "Never deploy the test keys: always-pass switches the bot check off") and `docs/runbook.md` → `## Bot protection (Turnstile)`: add one sentence to each: in production (`VERCEL_ENV=production`) the app now refuses Cloudflare's test keys (the form shows "registration is paused" and the log line is `turnstile.test_key_in_production`). Change nothing else in them.
- Review constraints: test mode only, the public form stays behind Turnstile, no personal data in logs (log key names only), build reads no env (everything is read inside functions).
- Scope: only the listed files; don't refactor adjacent code.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Use `NODE_ENV` to detect production, or log any key value.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @rr/web test
pnpm build
```
- The new tests fail if you change the form's input name to anything but `HONEYPOT_FIELD` (try it once locally, then revert).
- `grep -rn '"fax_number"' apps/web/src apps/web/app --include=*.ts --include=*.tsx` shows the literal only in `fields.ts` and in test files.
