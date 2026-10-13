# Changelog — Riverline Run

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A version is added when its
sprint (MINOR) or hotfix (PATCH) ships.

## [0.1.0] — 2026-10-09

Sprint 1 — Runner site, registration and test payments (epic FRW-1).

### Added

- Monorepo scaffold (pnpm + Turborepo), CI that runs format, lint, typecheck, tests and a build with
  no env, and fail-fast env loading in `@rr/env` (FRW-2).
- Race list (`RACES`, prices in centavos), `registrations` table with payment states and a
  least-privilege app database role (FRW-3).
- One-page runner site from the mockups, `@rr/ui` tokens and components, the test-mode banner on
  every page, `/privacy` and SEO (FRW-4).
- Registration form → PayMongo hosted checkout (test keys only), with payment confirmed on the
  server from the success page, never from the URL (FRW-5).
- Signed PayMongo webhook that confirms paid checkouts through the same idempotent
  `confirmPayment()` (FRW-6).
- Bot protection on the registration form: Cloudflare Turnstile and a honeypot, failing closed
  (FRW-7).
- Registration confirmation email (Resend + React Email, HTML and plain text), sent exactly once
  per paid registration and retried on failure (FRW-8).
