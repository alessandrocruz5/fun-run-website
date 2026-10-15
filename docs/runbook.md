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

6. **Once per Neon branch, after migration `0003`:** create the dashboard's login role the same
   way. See **Organizer dashboard** below.

New schema changes: edit `packages/db/src/schema/`, then
`pnpm --filter @rr/db db:generate --name <name>` and commit the SQL and `meta/`. Changes are
expand/contract: add first, deploy the code that uses it, and remove the old shape in a later
migration. An applied migration is never edited. A new table needs its own `GRANT` to `rr_app`
(and to `rr_admin`, if the dashboard reads it) in the migration.

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
  mode, in PHP and equal to the row's `amount_centavos`. Then the confirmation email goes out
  once (see **Email** below). Reloading the page is safe.
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
  - `webhook.confirm_failed`: the database or the confirmation email failed during a delivery
    (`error: "EmailError"` with Resend's status and code, or `EnvValidationError` naming
    `RESEND_API_KEY` / `EMAIL_FROM`). PayMongo retries it.
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
  | 500 | `{"error":"unavailable"}` | Secret not configured, the database failed, or the confirmation email failed. PayMongo retries. |

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
  "token already used". In production (`VERCEL_ENV=production`) the app refuses Cloudflare's test
  keys: a test site key pauses registration, a test secret refuses every submission with the retry
  message, and both log `turnstile.test_key_in_production` with the key's name. The guard relies
  on Vercel's `VERCEL_ENV`, so keep "Automatically expose System Environment Variables" on (site
  project → Settings → Environment Variables); with it off the test keys are accepted again.
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

One confirmation email per paid registration, sent by `@rr/email` through Resend's HTTP API. It
has an HTML and a plain-text part (React Email) with the runner's name, race, reference and amount,
the race date, venue, assembly time (30 minutes before gun time) and gun time, and the notice "Test
payment: nothing was charged".

- **Setup.** Resend → Domains → add a subdomain you control (e.g. `mail.<domain>`) and add its SPF
  and DKIM records until it shows **Verified**. Resend → API Keys → a key with **Sending access**
  for that domain only. Set `RESEND_API_KEY` and `EMAIL_FROM` (`Riverline Run <race@mail.<domain>>`)
  in Vercel **Production** and **Preview**, then redeploy. Locally, `onboarding@resend.dev` as the
  sender works without a domain, but only delivers to your Resend account's address.
- **Deploy order.** Every query on `registrations` names the `confirmation_claimed_at` column
  (migration `0004`), so this code on a database without it fails with `42703` (undefined column)
  on the form, the success page and the webhook: the whole site is down, not only the email.
  Apply `0004` (see **Migrations**) to `dev` before any Preview runs this code, and to `main`
  before merging into `main`. A merge deploys by itself.
- **When it is sent.** Only after a payment is recorded: whichever of the webhook and the success
  page sees `paid` claims the row (`confirmation_claimed_at`, one conditional update) and sends.
  Every other caller finds the claim taken and sends nothing. Once Resend accepts the email,
  `confirmation_sent_at` is set: it means delivered, and a row with it set is never sent again.
  Pending and cancelled registrations never get an email. Resend's `Idempotency-Key` is the
  registration ID, so a request repeated within 24 hours is never delivered twice.
- **Self-heal.** A claim older than 5 minutes on a row that is still unsent and was paid less than
  23 hours ago is taken again by the next caller, which sends the email. If the first sender had
  in fact reached Resend, the same idempotency key means it isn't delivered twice. In practice
  that caller is the runner reloading `/register/success` (the checkout cookie lasts 24 hours) or
  a webhook event you resend from the PayMongo dashboard. PayMongo's automatic retries rarely
  heal a row: a caller that finds the claim held answers 200, which ends them, and a retry that
  isn't re-signed is refused as `stale` after 5 minutes. Don't wait for it: see **Stuck claim**.
- **When sending fails** (Resend down, rate-limited, bad key, missing env), the claim is released
  and the error rethrown: the webhook answers 500 so PayMongo retries, and the success page says
  "We couldn't check just now" so the runner's **Check again** retries. The payment itself stays
  recorded.
- **Logs** carry the registration ID, Resend's status and error name, never an address or name:
  - `email.send_failed`: the send failed and the claim was released. `401`/`403` is the key,
    `422 validation_error` is usually `EMAIL_FROM` on an unverified domain, `429` is Resend's rate
    limit. `EnvValidationError` names the missing variable.
  - `email.release_failed`: the claim couldn't be released after a failed send (database down).
    The row keeps its claim with no email sent: see **Stuck claim**.
  - `email.mark_sent_failed`: the email went out, but recording the delivery failed (database
    down). The confirmation still succeeds. The row keeps only its claim, so the dashboard shows the
    email as not sent until a later caller sends it again (Resend doesn't deliver it twice) and
    records it: see **Stuck claim**.
  - `email.duplicate`: Resend had already used this registration's key with a different payload
    (e.g. the template changed between two attempts within 24 hours). That earlier request went
    out, so this one is treated as sent and recorded as delivered.
- **Stuck claim.** A paid row whose claim went stale with no delivery recorded (it shows "not
  sent" in the dashboard). Find them:
  ```sql
  SELECT reference, paid_at, confirmation_claimed_at FROM registrations
  WHERE status = 'paid' AND confirmation_sent_at IS NULL
    AND confirmation_claimed_at < now() - interval '5 minutes';
  ```
  - **Paid less than 23 hours ago:** fix it now. Resend that payment's webhook event from the
    PayMongo dashboard: the stale claim is taken again and the email sent, and if it had already
    gone out, Resend's idempotency key stops a second copy. No SQL needed.
  - **Paid 23 hours ago or more:** a re-send is outside Resend's 24-hour idempotency window and
    could deliver twice. Check Resend → Emails (search by the reference in the subject) first.
    Resend keeps a limited history; if it no longer covers that date, you can't rule out a send.
    With no send there, as the owner, clear the claim and resend the webhook event:
    ```sql
    UPDATE registrations SET confirmation_claimed_at = NULL
    WHERE reference = '<RR-…>' AND status = 'paid' AND confirmation_sent_at IS NULL;
    ```
  - **Stuck before migration `0004`:** the row shows `confirmation_sent_at` set although no email
    went out, so the query above doesn't list it. Only when Resend → Emails shows no send, clear
    both columns and resend the webhook event:
    ```sql
    UPDATE registrations SET confirmation_sent_at = NULL, confirmation_claimed_at = NULL
    WHERE reference = '<RR-…>' AND status = 'paid';
    ```
- **Check it** (production): pay with card `4343 4343 4343 4345` using an address you can read.
  One email arrives with both parts (Gmail → Show original lists `text/plain` and `text/html`).
  Resend → Emails shows one send for the reference. Reload `/register/success` and resend the
  webhook event: still one email.

## Organizer dashboard (apps/admin)

A separate Next.js app with its own Vercel project and URL. It signs organizers in with Better Auth
(email and password, no sign-up) and holds the only login secrets. The public site has none, and
its database role can't read the auth tables.

- **Vercel project (once).** A second project on the same repo: root directory `apps/admin`,
  framework Next.js, production branch `main`, "Include files outside the root directory" on.
  `apps/admin/vercel.json` builds with `turbo run build --filter=@rr/admin` and pins `sin1`.
  The build needs no environment variables.
- **Database role (once per Neon branch, after migration `0003`).** As the owner, with SQL (not
  the Neon Console):
  ```sql
  -- password: openssl rand -base64 32
  CREATE ROLE rr_admin_login LOGIN PASSWORD '<password>' IN ROLE rr_admin;
  ```
  `rr_admin` may only `SELECT` from `registrations`, plus read and write the Better Auth tables
  (`auth_*`). It has no DDL. Check it:
  ```sh
  psql "$ADMIN_DATABASE_URL" -c "DELETE FROM registrations WHERE false"
  # ERROR:  permission denied for table registrations
  ```
- **Accounts.** There is no sign-up endpoint, so the two accounts come from the seed. In
  `packages/db/.env` (see `.env.example`), next to `MIGRATE_DATABASE_URL`, set
  `ORGANIZER_OWNER_EMAIL` / `ORGANIZER_OWNER_PASSWORD` (from your password manager, 16+
  characters) and `DEMO_VIEWER_EMAIL` / `DEMO_VIEWER_PASSWORD` (`openssl rand -base64 24`). Then
  run, once per Neon branch:
  ```sh
  pnpm --filter @rr/db seed:organizers
  ```
  It upserts both accounts by email. Re-running it resets both passwords and signs both accounts
  out everywhere. That is also how to rotate a password.
- **Env (admin project only, Production).** `DATABASE_URL` (the pooled `rr_admin_login` URL of
  `main`), `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` (the dashboard's
  origin, no trailing slash) and `DEMO_VIEWER_EMAIL` / `DEMO_VIEWER_PASSWORD` (the same values as
  the seed). Then redeploy. For Preview, use the `dev` branch's `rr_admin_login` URL. Locally,
  copy `apps/admin/.env.example` to `apps/admin/.env.local`. Without the demo variables, the demo
  button is disabled. Changing `BETTER_AUTH_SECRET` signs everyone out.
- **How access works.** `proxy.ts` sends visitors with no session cookie to `/login`. That is only
  a fast path: the dashboard layout and every page and data function call `requireSession()`,
  which looks the session up in the database. Sessions last 12 hours. The owner sees full data and
  the viewer (the demo) sees it masked. Neither role can create users, change roles or
  impersonate.
- **Sign-in and rate limiting.** The password form and the "Explore the organizer demo" button
  are server actions. They go through Better Auth's router, which allows 5 sign-in attempts per
  minute per IP (the IP comes from Vercel's `x-forwarded-for`). The counts live in
  `auth_rate_limits`, so every instance shares them. The demo password stays on the server: the
  button's form posts no fields. `/api/auth/*` forwards only `GET /get-session`,
  `POST /sign-in/email` and `POST /sign-out`. Everything else, sign-up included, gets 404.
- **Personal data.** Sessions store no IP address or user agent. `auth_rate_limits` keeps
  `<ip>|<path>` for the length of a window, and stale rows are pruned on later sign-ins.
  `DELETE FROM auth_rate_limits;` clears them at any time.
- **Logs** carry reasons and error classes, never an email address or password:
  - `auth.sign_in_rejected` with `reason` `invalid_credentials` or `rate_limited`.
  - `auth.sign_in_failed`: the database or env failed (the error class, or `EnvValidationError`
    naming the variable). The visitor sees "Sign-in isn't available right now".
  - `auth.demo_unavailable` with `reason` `env_missing` (set the demo variables and redeploy) or
    `credentials_rejected` (the env and the seed disagree: re-run `seed:organizers` with the same
    values).
  - `auth.warn` / `auth.error`: Better Auth's own messages. Query parameters and email addresses
    are redacted.
- **Check it** (production):
  ```sh
  curl -sI https://<admin-domain>/ | grep -iE '^HTTP|^location'          # 307, location: /login
  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<admin-domain>/api/auth/sign-up/email \
    -H 'content-type: application/json' -d '{}'                           # 404
  for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} ' -X POST \
    https://<admin-domain>/api/auth/sign-in/email -H 'content-type: application/json' \
    -d '{"email":"nobody@example.com","password":"wrong-password"}'; done  # 401 ×5, then 429
  ```
  The last check locks your IP out of sign-in for a minute. Then open the dashboard and click
  **Explore the organizer demo**: the header says `VIEWER`. Sign out, then sign in with the owner
  account: the header says `OWNER`.
- **Demo data (weekly).** The dashboard shows 300 fake registrations (`@example.com`, spread over
  the last 60 days). With the owner's `MIGRATE_DATABASE_URL` in `packages/db/.env`, from the
  repo root:
  ```sh
  ALLOW_DEMO_SEED=1 pnpm --filter @rr/db seed:registrations
  ```
  It **deletes every registration first**, visitors' real ones included: that is the weekly
  deletion `/privacy` promises, so run it at least every 7 days. It also deletes expired organizer
  sessions and every sign-in rate-limit entry. `ALLOW_DEMO_SEED=1` must be on the command line:
  the script checks it before loading `.env`, so a value saved there doesn't count. It runs as separate
  statements, not one transaction, so if it fails partway, run it again. Run it on `dev`
  first after a schema change. When the reseed is overdue, the owner's overview shows a notice
  with the number of visitor registrations older than 7 days (the viewer never sees it). The
  check ignores the seed's own fake rows (`+63900000xxxx` mobiles), which are up to 60 days old.
- **What the dashboard shows.** The overview counts **paid rows only** for runners, gross, fees,
  net, age groups (age today) and shirt sizes. "Abandoned" is cancelled, or unpaid after 24 hours.
  Days are Manila time. The registrations list keeps its search, filters, sort and page in the URL.
  For the viewer, `@rr/db/admin` masks email and mobile in the SQL and hides birthdate and
  emergency contact, and search matches only names and references (so it can't confirm whether
  an address is registered). The viewer's birthdate and emergency contact come back null. The
  search term is in the URL (`?q=`), so a name, or an owner's email or mobile search, can appear
  in Vercel's request logs and browser history; `/privacy` says so. Our own logs never carry it.
- **Detail page and CSV export.** `/registrations/<reference>` shows one registration, masked the
  same way as the list. `/registrations/export` downloads the list as CSV with the page's search,
  filters and sort (every match, not one page), masked the same way. It checks the login itself
  and answers `Cache-Control: no-store`. Cells starting `=`, `+`, `-` or `@` get a leading `'` so a
  spreadsheet doesn't run them as formulas.
- **Demo links on the runner site.** The footer and the success page link to `/organizer` on the
  site, which redirects to `ADMIN_URL` (the dashboard's origin, no trailing slash). Set it in the
  **site's** Vercel project (Production and Preview), then redeploy. It is the only dashboard
  detail the public site holds. Without it, only that link returns 500.

## Security headers

- **What is sent.** Every page of the runner site gets a `Content-Security-Policy` with a fresh
  nonce per request, from `apps/web/proxy.ts` (policy in `apps/web/src/lib/csp.ts`). Scripts run
  only with that nonce (`'strict-dynamic'`, no `'unsafe-inline'`, and `'unsafe-eval'` only under
  `next dev`); Turnstile's `https://challenges.cloudflare.com` is allowed for scripts, calls and
  its iframe; the site can't be framed (`frame-ancestors 'none'`). `upgrade-insecure-requests` is
  added only when `VERCEL_ENV=production`, so `next start` on `http://localhost` stays on http.
  There is deliberately no `form-action`: without JavaScript the register form answers with a 303
  to PayMongo's checkout, and `form-action` would block that redirect.
  `apps/web/next.config.ts` adds `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that turns off
  camera, microphone, geolocation, payment and USB, on every response. `/api/*` gets no CSP (the
  proxy skips it) and keeps `Cache-Control: no-store`. Vercel sends HSTS itself.
- **Dashboard.** The organizer dashboard gets a nonce CSP the same way, from `apps/admin/proxy.ts`
  (policy in `apps/admin/src/lib/csp.ts`), on every page and API response the proxy matches,
  including `/login` and `/api/auth/*` (Next's trailing-slash 308s and static-asset 404s are sent
  without it). It is stricter: no third-party origin at all, `form-action 'self'` (sign-in and
  sign-out are same-origin server actions) and `frame-ancestors 'none'`. Its matcher skips only
  static assets, not router prefetches, so prefetches are still redirected.
  `apps/admin/next.config.ts` sends `Referrer-Policy: same-origin`, so reference numbers in
  dashboard URLs never leave the origin; not `no-referrer`, which sends `Origin: null` on
  same-origin POSTs and makes Next reject every server action (sign-in, the demo button,
  sign-out). The proxy still only redirects on a missing cookie: `requireSession()` in the layout
  and every data function is the check.
- **Check it:** `curl -sI https://<site>/ | grep -i content-security-policy` shows one policy with
  a `'nonce-…'`, different on each request.
- **Reading a violation.** Browser dev tools → Console: a blocked resource logs
  `Refused to load …` / `Refused to execute …` / `Refused to frame …`, naming the directive and
  the URL. A broken widget, menu or form with such a line is the policy, not the code. On a
  Preview deploy, a `vercel.live` violation is the Vercel Toolbar, which has no nonce (and
  `'strict-dynamic'` ignores host allowlists): turn the toolbar off for the project or do the
  console check on Production.
- **Adding a third party.** A new script, iframe or fetch origin must be added to the matching
  directive in `apps/web/src/lib/csp.ts`, with a test in `apps/web/src/lib/__tests__/csp.test.ts`.
  Components need no `nonce` prop: Next adds the nonce from the request's policy.
- **Local check:** the always-pass Turnstile site key `1x00000000000000000000AA` loads the real
  widget from Cloudflare, so it exercises the policy, but it works only outside production (see
  Bot protection above).

## Browser smoke tests (CI)

`packages/e2e` (`@rr/e2e`) is a Playwright suite in Chromium. CI's `verify` job runs it right after
`pnpm build`, so a failure blocks the merge like any other step.

- **What it checks.** The "Fictional event · Test mode, no real payments" banner on every page
  of the site (the 404 included) and on the dashboard's `/login`; `Cache-Control: no-store` on
  `/api/*`; the nonce CSP (a new nonce per request, `frame-ancestors 'none'` enforced by the
  browser, no violations, no third-party requests) and the security headers above; the webhook
  answering 401 to a missing or bad `Paymongo-Signature` before it touches the database;
  registration paused without a Turnstile key; `/register/success` ignoring URL parameters that
  claim a payment; the retention period on `/privacy`; the dummy webhook secret absent from `/`,
  its RSC payload and `/api/health`, and the dummy auth secret and any `postgres://` URL absent
  from `/login`; the dashboard redirecting to `/login` when signed out (prefetches too), and
  `/api/auth/*` answering 404 to sign-up and anything else off the allowlist.
- **How it runs.** `packages/e2e/playwright.config.ts` starts both apps with `next start` from the
  existing build (site on 3000, dashboard on 3001), with dummy env and no database. Every key the
  apps read that it doesn't set is passed empty, so a local `apps/*/.env.local` can't supply it
  (`next start` never overrides a variable the process already has). It runs no `next build`:
  without `.next` the servers don't start. Ports 3000 and 3001 must be free: a server already on
  them (say a `next dev` with your real `.env.local`) is never reused, so the run fails at once.
- **What it can't check.** A real database, PayMongo, Resend or Turnstile: see Pre-release
  verification. Two more gaps: `GET /api/auth/get-session` answers 500 without a database (the
  auth router's rate limiter is stored there), so the specs check only its headers. And a known
  bug: the dashboard's 404 page is prerendered without a CSP nonce, so the browser blocks its
  scripts; any session cookie, even a forged one, gets past the proxy to it. A test pins the
  blocked scripts and fails once a dynamic `apps/admin/app/not-found.tsx` fixes it: then make it
  assert no violations.
- **Run it locally.** Once: `pnpm --filter @rr/e2e exec playwright install chromium`. Then, from
  the repo root, with nothing on 3000 or 3001:
  ```sh
  pnpm build && pnpm e2e
  ```
- **A failed CI run.** The run's summary page → Artifacts → `playwright-report` (kept 7 days; it
  holds only dummy-env pages). Unzip it, then (the command runs in `packages/e2e`, so give an
  absolute path):
  ```sh
  pnpm --filter @rr/e2e exec playwright show-report /absolute/path/to/unzipped/playwright-report
  ```
  `test-results/` next to it holds each failed test's output. CI retries a failed test once, so
  a test that passes on the retry shows as flaky, not failed.
- **Adding a third party.** Add the origin to the CSP first (Security headers above), then to
  these specs: the web suite fails on any request from `/` to an origin other than the site's own.

## Pre-release verification

Before the `develop` → `main` release, the owner must verify the items below against production
accounts and the production Vercel/GitHub/Neon projects. Code checks these constraints, but only the
owner can confirm real accounts, real mail, real Turnstile keys and operational rules.

- [ ] **Secret rotation.** `BETTER_AUTH_SECRET` was exposed in git at commit `c5efb3f` (2026-10-15).
  Confirm it was rotated in the admin Vercel project (both Production and Preview) and the dashboard
  redeployed. Do not paste the new value anywhere. See [Incidents → Secret exposure](#incidents).
- [ ] **GitHub.** Settings → Code security: **secret scanning** and **push protection** are on.
  Dependabot shows version-update PRs after the first week. The `secrets` job (gitleaks) and `verify`
  job (with e2e) are both green on `main`.
- [ ] **Migration 0004** (`confirmation_claimed_at`). Apply it to Neon `dev` first, then to `main`,
  before deploying the web app. See [Migrations](#migrations). Afterwards:
  ```sh
  psql "$MIGRATE_DATABASE_URL" -c "SELECT COUNT(*) FROM registrations WHERE confirmation_claimed_at IS NOT NULL;"
  ```
  Should show a count (confirmed the column exists).
- [ ] **Real email.** On the production site, pay a test registration using an address you control.
  Exactly one email arrives with both HTML and plain-text parts. Check the dashboard detail page:
  it shows "email sent" with a timestamp. Reload `/register/success` and resend the webhook event
  from the PayMongo dashboard: the email count stays at one. See [Email (Resend) → Check it](#email-resend).
- [ ] **Stuck-claim self-heal** (optional, on `dev`). As the owner, update a paid test row:
  ```sql
  UPDATE registrations SET confirmation_sent_at = NULL,
    confirmation_claimed_at = now() - interval '10 minutes'
  WHERE reference = '<RR-…>' AND status = 'paid';
  ```
  Reload that runner's `/register/success`: the email is re-sent once and `confirmation_sent_at`
  is set. See [Email (Resend) → Stuck claim](#email-resend).
- [ ] **Webhook retries.** From the PayMongo dashboard, resend an event that was originally delivered
  more than 5 minutes ago. Note whether it gets a 401 `stale` response. This answers the open FRW-6
  question about webhook retry signatures. See [Webhook (PayMongo test mode) → End-to-end check](#webhook-paymongo-test-mode).
- [ ] **Turnstile on a phone.** Test the registration form on the Preview deploy from a real phone:
  the Cloudflare Turnstile widget renders and the form submits. Also confirm production uses real
  Turnstile keys, not Cloudflare's `1x…`, `2x…` or `3x…` test keys. If a test key is set, the form
  shows "registration is paused" (the site now refuses them in production).
- [ ] **CSP console check.** Open the public site (home page, register section, `/privacy`) and the
  dashboard (`/login`, overview, a registration detail) in a desktop browser with the console open.
  No `Content Security Policy` errors should appear. Check the headers:
  ```sh
  curl -sI https://<prod-domain>/ | grep -iE 'content-security-policy|x-content-type-options'
  curl -sI https://<prod-domain>/api/health | grep -i cache-control        # must be no-store
  curl -sI https://<admin-domain>/login | grep -iE 'content-security-policy|referrer-policy'
  ```
  See [Security headers](#security-headers).
- [ ] **Rate limit the form.** Vercel → the web project → Settings → Firewall → add a rate-limit
  rule: `POST` to `/` (the registration server action posts to the page), keyed by IP, about 10
  requests per minute, action 429. Verify what the Hobby plan allows (the number of rules is limited).
  Do not include `/api/webhooks/paymongo`.
- [ ] **Dashboard against Neon (FRW-10 owner op).** On production, sign in as the owner and then as
  the demo viewer: the viewer sees masked data (email masked, mobile masked, birthdate and emergency
  contact hidden). Check the allowlist:
  ```sh
  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<admin-domain>/api/auth/sign-up/email \
    -H 'content-type: application/json' -d '{}'
  ```
  Should be 404. See [Organizer dashboard (apps/admin)](#organizer-dashboard-appsadmin).
- [ ] **Retention.** Run the weekly reseed with the owner's `MIGRATE_DATABASE_URL`. See
  [Organizer dashboard (apps/admin) → Demo data](#organizer-dashboard-appsadmin). Afterwards, on
  production, the owner's overview should show no "older than 7 days" notice.
- [ ] **Env.** `ADMIN_URL` is set in the web Vercel project (Production and Preview). `/organizer`
  on the site redirects to the dashboard. See [Organizer dashboard (apps/admin) → Demo links](#organizer-dashboard-appsadmin).

When every box above is ticked, tag the release (merge `develop` → `main`) as v0.3.0 in the Deploy section.

## Roll back

- **App:** Vercel dashboard → Deployments → the last good production deploy → **Instant
  Rollback**, or `vercel rollback <deployment-url>`. It takes effect at once, with no rebuild.
- **Schema:** never down-migrate or edit an applied migration. Because migrations are
  expand/contract, the previous app deploy still runs on the newer schema: roll back the app
  first, then fix forward with a new migration.
- **Data:** Neon Console → the branch → **Restore** to a point in time inside the plan's history
  window. Restore `dev` first to check the result. A restore also rewinds the roles, so re-check
  `rr_app_login` and `rr_admin_login` afterwards.

## Env var changes

Env changes apply only to **new** deployments. After editing a variable, redeploy: Deployments →
latest → **Redeploy**, or push a commit.

## Incidents

- **Liveness:** `GET /api/health` returns `200 {"status":"ok"}` with `Cache-Control: no-store`. It
  touches no database, so it stays up when Neon is down or asleep.
- **Logs:** `vercel logs <deployment-url>`, or the dashboard's Logs tab. Env validation failures
  fail fast with `Invalid environment variables:` and list the offending keys, never their values.

### Secret exposure

- **A committed secret is public.** Treat any secret that reached git (a commit, a PR, a fork) as
  leaked: rotate it. Deleting the line only hides it from the latest tree.
- **`BETTER_AUTH_SECRET`:** generate a new one with `openssl rand -base64 32`, set it in the
  **admin** Vercel project (Production and Preview), then redeploy. It signs every organizer out;
  no re-seed is needed.
- **Other secrets:** roll `PAYMONGO_*`, `RESEND_API_KEY` and `TURNSTILE_SECRET_KEY` in the
  provider's dashboard, update them in Vercel, then redeploy. For a database login, as the owner,
  on the Neon branch whose URL leaked (Production → `main`, Preview → `dev`):
  ```sql
  -- password: openssl rand -base64 32
  ALTER ROLE rr_app_login PASSWORD '<password>'; -- or rr_admin_login
  ```
  Then update that app's `DATABASE_URL` in Vercel (and `.env.local`) and redeploy.
- **Login secrets:** for `ORGANIZER_OWNER_PASSWORD` or `DEMO_VIEWER_PASSWORD`, set a new value in
  `packages/db/.env` and re-run `pnpm --filter @rr/db seed:organizers` on each Neon branch (see
  Organizer dashboard). For the demo viewer, also set the same `DEMO_VIEWER_PASSWORD` in the
  admin Vercel project and redeploy. For the owner password behind `MIGRATE_DATABASE_URL`, reset
  it in the Neon Console and update `packages/db/.env` only; it is never in Vercel.
- **Don't rewrite `main`'s history.** Rotation makes the old value dead; a force-push breaks every
  clone and open PR and doesn't remove copies GitHub or others already have.
- **Catching the next one:** the CI `secrets` job (gitleaks) fails a PR or a push to `develop` or
  `main` that adds a secret. By then the secret is already on GitHub, so rotate it anyway. GitHub's
  secret scanning and push protection (repo Settings → Code security) only know provider token
  formats: they won't catch a random value like `BETTER_AUTH_SECRET`.
