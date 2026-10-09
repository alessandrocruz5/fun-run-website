# Runbook

Operational procedures for Riverline Run. CLI commands assume `cd apps/web` with the project
linked (`vercel link`). Sections marked _TBD_ are filled in by the unit named.

## Vercel project (once)

- Root directory `apps/web`, framework Next.js, production branch `main`. Keep "Include files
  outside the root directory" on: the build runs from the monorepo root.
- `apps/web/vercel.json` sets the build command (`turbo run build --filter=@rr/web`) and pins
  functions to `sin1` (Singapore), next to the Neon `ap-southeast-1` database.
- The build needs no environment variables. Variables added later are runtime-only.

## Site URL

- `SITE_URL` is the public origin with no trailing slash, e.g. `https://<prod-domain>`. It is
  read per request for page metadata, `robots.txt`, `sitemap.xml` and the share image. If it is
  missing, `robots.txt`, `sitemap.xml`, the share image and link-preview crawlers (Facebook, X)
  get a 500. Browsers still get the page, without its metadata. The logs name `SITE_URL`.
- Set it in Vercel for **Production** and **Preview**. Previews can use the production URL. Then
  redeploy. Locally, copy `apps/web/.env.example` to `apps/web/.env.local`.
- Check it:
  ```sh
  curl -s https://<prod-domain>/robots.txt | grep -i '^sitemap'   # Sitemap: https://<prod-domain>/sitemap.xml
  ```

## Deploy

1. Push a branch or open a PR. CI runs format check, lint, typecheck, tests and build. Vercel
   builds a **Preview**, which needs a Vercel login (Deployment Protection).
2. Merge to `main`. Vercel builds and promotes **Production**.
3. Smoke-test production:
   ```sh
   curl -si https://<prod-domain>/api/health | grep -iE '^HTTP|^cache-control'
   # HTTP/2 200 and cache-control: no-store; the body is {"status":"ok"}
   curl -s https://<prod-domain>/ | grep -c 'Test mode, no real payments'   # at least 1
   ```

## Migrations

Neon project in `ap-southeast-1` with branches `main` (production) and `dev`. Migrations run as
the owner, from a laptop, and never from CI or Vercel.

1. Put the branch's **direct** (non-pooled) owner URL in `packages/db/.env` as
   `MIGRATE_DATABASE_URL` (see `packages/db/.env.example`). Never add it to Vercel.
2. Apply to `dev` first, then `main`:
   ```sh
   pnpm --filter @rr/db db:migrate
   ```
3. **Once per Neon branch, after migration `0001`:** create the app's login role. Use SQL
   (`psql` or the Neon SQL editor, as the owner), **not** the Neon Console: Console roles join
   `neon_superuser` and would bypass the least-privilege grants.
   ```sql
   -- password: openssl rand -base64 32
   CREATE ROLE rr_app_login LOGIN PASSWORD '<password>' IN ROLE rr_app;
   ```
4. `DATABASE_URL` = the **pooled** URL (`-pooler` host) with `rr_app_login`. Set it in Vercel
   (Production → `main` branch; Preview → `dev` branch) and in `apps/web/.env.local`, then
   redeploy.
5. Check the role is least-privilege:
   ```sh
   psql "$DATABASE_URL" -c "DELETE FROM registrations WHERE false"
   # ERROR:  permission denied for table registrations
   ```

New schema changes: edit `packages/db/src/schema/`, then
`pnpm --filter @rr/db db:generate --name <name>` and commit the SQL and `meta/`. Changes are
expand/contract: add first, deploy the code that uses it, and remove the old shape in a later
migration. An applied migration is never edited. A new table needs its own `GRANT` to `rr_app`
in the migration.

## Payments (PayMongo test mode)

- **Key.** PayMongo Dashboard → Developers → API keys, in **test mode**. Only the secret key is
  used: Hosted Checkout needs no public key. Set `PAYMONGO_SECRET_KEY` in Vercel (Production and
  Preview) and in `apps/web/.env.local`, then redeploy. Anything not starting `sk_test_` fails
  validation: the form shows its retry message and the logs show `registration.checkout_failed`
  naming `PAYMONGO_SECRET_KEY`. Never use a live key or a `NEXT_PUBLIC_` prefix.
- **Flow.** The form's server action saves a `pending` row (price from `RACES`), creates a
  checkout session whose only metadata is `registration_id`, saves the `cs_…` ID on the row, sets
  the httpOnly `rr_checkout` cookie (path `/register`, 24 hours) and redirects to
  `checkout.paymongo.com`. Card, GCash, Maya and GrabPay are offered; all are simulated in test
  mode. PayMongo sends the runner back to `SITE_URL/register/success`, or `/register/cancelled`
  from its back link.
- **Confirmation.** `/register/success` ignores its URL. It takes the session ID from the cookie,
  finds the row, reads the session from PayMongo and calls `confirmPayment()`. The row becomes
  `paid`, with payment ID, method, fee, net and `paid_at`, only when a payment is `paid`, not live
  mode, in PHP and equal to the row's `amount_centavos`. Reloading the page is safe.
- **End-to-end check (production).** Register on the production site and pay with card
  `4343 4343 4343 4345`, any future expiry and any CVC. The success page must say **Confirmed**.
  Then, in the Neon SQL editor on `main`:
  ```sql
  SELECT reference, status, amount_centavos, payment_method, fee_centavos, net_centavos, paid_at
  FROM registrations ORDER BY created_at DESC LIMIT 1;
  -- status paid, payment_method card, fee/net/paid_at filled in
  ```
- **Previews.** When Preview's `SITE_URL` is the production URL, PayMongo returns the runner to
  production, which doesn't have the preview's cookie: the success page says it can't find the
  checkout. Test payments on production, or locally with `DATABASE_URL` on the `dev` branch.
- **Logs** carry IDs, reasons and PayMongo error codes, never personal data:
  - `registration.checkout_failed`: PayMongo refused or didn't answer, or the database or env
    failed (`code` is the SQLSTATE, e.g. `42501` for a missing grant). The row (if any) was set
    `cancelled`, and the runner saw a retry message. `registration.cancel_failed` means that row
    stayed `pending`.
  - `payment.check_failed`: the success page couldn't reach PayMongo or the database. The runner
    is told to check again.
  - `payment.rejected` with a `reason`. `amount_mismatch` means the paid amount differs from the
    snapshot: investigate, and never set a row to `paid` by hand. The others are `livemode`,
    `metadata_mismatch`, `unknown_session` and `not_recorded`.
  - `webhook.unauthorized` with a `reason` (`missing`, `malformed`, `stale`, `mismatch`): a
    request to the webhook without a valid signature got 401. Repeated `mismatch` on PayMongo's
    deliveries means `PAYMONGO_WEBHOOK_SECRET` isn't the webhook's secret key.
  - `webhook.env_failed`: `PAYMONGO_WEBHOOK_SECRET` is missing or invalid. Every delivery gets 500
    until it is set and redeployed.
  - `webhook.confirm_failed`: the database failed during a delivery. PayMongo retries it.
  - `webhook.invalid_event`, `webhook.rejected` (`livemode`) and `webhook.unpaid`: a signed event
    the app couldn't use. See **Webhook** below.
- **Paid but still `pending`:** neither the success page nor the webhook recorded it. Open the
  webhook's deliveries in the PayMongo dashboard: a 401 is the secret or a stale timestamp, a 500
  is the env or the database (see the logs above), and a disabled webhook needs re-enabling. Fix
  the cause, then resend the event from the dashboard. Never set the row to `paid` by hand.

## Webhook (PayMongo test mode)

- **Setup.** PayMongo Dashboard, in **test mode** → Developers → Webhooks → endpoint
  `https://<prod-domain>/api/webhooks/paymongo`, event `checkout_session.payment.paid` only.
  Copy the webhook's secret key into Vercel **Production** as `PAYMONGO_WEBHOOK_SECRET`, then
  redeploy. Not Preview: Deployment Protection answers PayMongo with 401. An API key (`sk_…`,
  `pk_…`) in that variable fails validation.
- **What it does.** `POST /api/webhooks/paymongo` runs on Node and answers with
  `Cache-Control: no-store`. It first verifies `Paymongo-Signature` on the raw body: the hex
  HMAC-SHA256 of `<t>.<body>` with the secret, compared in constant time with the test-mode `te`
  only, and `t` within 5 minutes of the server clock. Only then does it read the event. It refuses
  `livemode: true`, ignores every other event type and passes the checkout session to the same
  `confirmPayment()` as the success page, which checks the amount and saves the payment ID,
  method, fee, net and `paid_at`. It closes the gap where the `rr_checkout` cookie only holds the
  latest checkout.
- **Responses** (shown in the webhook's deliveries in the PayMongo dashboard):

  | Status | Body | Meaning |
  | --- | --- | --- |
  | 200 | `{"outcome":"paid"}` | Recorded now, or already recorded (repeats and retries change nothing). |
  | 200 | `{"outcome":"ignored"}` | Another event type. Nothing changed. |
  | 200 | `{"outcome":"rejected"}` | `confirmPayment()` refused it; `payment.rejected` has the reason. |
  | 200 | `{"outcome":"unpaid"}` | The session in the event had no paid payment (`webhook.unpaid`). |
  | 400 | `{"error":"livemode"}` / `{"error":"invalid_event"}` | Signed, but a live-mode or unreadable event. Nothing changed. |
  | 401 | `{"error":"invalid_signature"}` | Signature missing, malformed, stale or wrong. The database is never touched. |
  | 500 | `{"error":"unavailable"}` | Secret not configured, or the database failed. PayMongo retries. |

  `rejected` with reason `unknown_session` is expected for checkouts started locally or on a
  Preview: there is one test webhook and it points at production, whose database doesn't have
  those sessions. They get 200 so PayMongo doesn't retry them.
- **Retries.** PayMongo retries a non-2xx with backoff for about two hours, and disables a webhook
  after three events in a row use up their retries. Re-enable it in the dashboard after fixing the
  cause. PayMongo doesn't document whether a retry is re-signed with a new `t`. If it isn't, a
  retry more than 5 minutes after the first attempt gets 401 `stale`, and the success page (or a
  dashboard resend) has to confirm the payment instead.
- **End-to-end check (production, tab closed).** Open DevTools → Network → **Request blocking**,
  block `*/register/success*` (or close the tab as soon as PayMongo accepts the payment), then
  register on the production site and pay with card `4343 4343 4343 4345`. The success page never
  runs, so only the webhook can record the payment:
  1. PayMongo → the webhook's deliveries: the event got 200 `{"outcome":"paid"}`.
  2. The SQL in **End-to-end check** above shows `paid` with method, fee, net and `paid_at`.
  3. Resend the same event from the dashboard: 200 `{"outcome":"paid"}` again, with no change to
     the row. Resend it again more than 5 minutes later: a 200 means resends carry a new `t`, and a
     401 `stale` (in the logs) means they don't.
  4. Unblock the request and open `/register/success` in the same browser: it says **Confirmed**.

## Bot protection (Turnstile)

The registration form has two checks, both run on the server in `register()` before any database
write or PayMongo call: a hidden honeypot input (`fax_number`) and a Cloudflare Turnstile token.
Order: validate the fields, honeypot, then Turnstile. A typo therefore doesn't use up the
single-use token.

- **Keys:** Cloudflare dashboard → Turnstile → add a widget for the production hostname (managed
  mode). Set `TURNSTILE_SITE_KEY` (public) and `TURNSTILE_SECRET_KEY` (server only) in Vercel for
  **Production** and **Preview**, then redeploy. Add each Preview hostname you want to test on to
  the widget, or use a second widget. Both are read per request, so the build needs neither.
- **Never deploy the test keys.** Cloudflare's always-pass pair (site `1x00000000000000000000AA`,
  secret `1x0000000000000000000000000000000AA`) switches the check off, with no error. Use them
  only in `apps/web/.env.local`. The always-fail pair is `2x00000000000000000000AB` /
  `2x0000000000000000000000000000000AA`; secret `3x0000000000000000000000000000000AA` answers
  "token already used".
- **Fail closed:** no token, an invalid, expired or reused token, a missing secret and an
  unreachable Cloudflare all refuse the registration, with a retry message. A missing site key
  disables the pay button and says registration is paused. Nothing is saved or sent to PayMongo.
- **Honeypot:** a filled `fax_number` gets the same message as a failed checkout, with no field
  errors and no Cloudflare call. It is logged as `registration.rejected` with `reason: honeypot`.
  A person can only trip it if an extension fills hidden inputs.
- **Logs:** `registration.rejected` carries `reason` (`honeypot`, `turnstile_missing`,
  `turnstile_rejected`, `turnstile_unavailable`) and Cloudflare's error codes only: no token, no
  personal data. `turnstile.env_invalid` and `turnstile.site_key_missing` name the variable at
  fault. A burst of `turnstile_unavailable` with `invalid-input-secret` means the secret doesn't
  match the widget's site key.
- **Check it** (production, after the keys are set):
  1. Open the site: the widget appears above the pay button and the button works once it passes.
  2. Browser dev tools → delete the `cf-turnstile-response` input, submit: "We couldn't confirm
     you're a person", and `registration.rejected` with `turnstile_missing` in the logs.
  3. Submit twice with the same token (copy the input's value into a second submit): the second
     is `turnstile_rejected` with `timeout-or-duplicate`.
  4. Neon: no row was added by steps 2 and 3.
- **Tests:** CI runs against fakes of Cloudflare's replies for the three test secret keys, not the
  live endpoint, so a Cloudflare outage can't fail a build. They were checked against the real
  endpoint on 2026-10-09.

## Email (Resend)

_TBD (FRW-8)._

## Roll back

- **App:** Vercel dashboard → Deployments → the last good production deploy → **Instant
  Rollback**, or `vercel rollback <deployment-url>`. It takes effect at once, with no rebuild.
- **Schema:** never down-migrate or edit an applied migration. Because migrations are
  expand/contract, the previous app deploy still runs on the newer schema: roll back the app
  first, then fix forward with a new migration.
- **Data:** Neon Console → the branch → **Restore** to a point in time inside the plan's history
  window. Restore `dev` first to check the result. A restore also rewinds the roles, so re-check
  `rr_app_login` afterwards.

## Env var changes

Env changes apply only to **new** deployments. After editing a variable, redeploy: Deployments →
latest → **Redeploy**, or push a commit.

## Incidents

- **Liveness:** `GET /api/health` returns `200 {"status":"ok"}` with `Cache-Control: no-store`. It
  touches no database, so it stays up when Neon is down or asleep.
- **Logs:** `vercel logs <deployment-url>`, or the dashboard's Logs tab. Env validation failures
  fail fast with `Invalid environment variables:` and list the offending keys, never their values.
