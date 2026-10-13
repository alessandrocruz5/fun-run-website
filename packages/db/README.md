# @rr/db

Drizzle schema, migrations and registration steps for Riverline Run, on Neon Postgres.

## Exports

| Import          | What                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| `@rr/db/races`  | `RACES` (5K/10K/21K/42K: price in centavos, gun time). No imports: safe in client components. |
| `@rr/db/schema` | Drizzle tables and enums, including Better Auth's `auth_*` tables (`authSchema`). |
| `@rr/db`        | All of the above, plus `getDb()` and the registration steps.                 |
| `@rr/db/seed-organizers` | `seedOrganizers(db, accounts)`, the dashboard's two accounts. Run as a script; tests import it. |

`getDb()` reads `DATABASE_URL` on first use, never at import, so `next build` needs no env. Every
step takes the `db` as its first argument, so tests pass a PGlite database instead.

## Registration steps

Each step is one conditional statement. A step that doesn't apply matches no row and returns
`null` (or `false`), so retries and the webhook / success-page race are safe.

| Step                                       | Effect                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `createPending(db, input)`                 | Inserts a `pending` row. The amount comes from `RACES`, never the caller. `consent_at` is stamped by the database. |
| `attachCheckoutSession(db, id, sessionId)` | Sets `checkout_session_id` once, on a pending row.                          |
| `getRegistrationByReference` / `…ByCheckoutSessionId` | Lookups.                                                         |
| `markPaid(db, payment)`                    | Not-paid → `paid` with payment ID, method, fee, net and `paid_at`, only if the paid amount equals the snapshot. A second call changes nothing. A `cancelled` row can still become paid. |
| `markCancelled(db, id)`                    | `pending` → `cancelled`. Never touches a paid row.                          |
| `claimConfirmation(db, id)`                | Sets `confirmation_sent_at` on a paid, unclaimed row: returns it to exactly one caller. |
| `releaseConfirmation(db, id)`              | Clears the claim after a failed send.                                       |

The claim is at-most-once: if the process dies between claim and send, no email goes out.

## Database roles

- **Owner** (`neondb_owner`): runs migrations from a laptop via `MIGRATE_DATABASE_URL`.
- **`rr_app`** (migration `0001`): group role, no login. `SELECT`, `INSERT`, `UPDATE` on
  `registrations` only: no `DELETE`, `TRUNCATE` or DDL.
- **`rr_app_login`**: created by hand in `rr_app`; the app's `DATABASE_URL`. See
  [docs/runbook.md](../../docs/runbook.md#migrations).
- **`rr_admin`** (migration `0003`): the organizer dashboard's group role, no login. `SELECT` on
  `registrations` only, plus `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the Better Auth tables
  (`auth_*`). No DDL. `rr_app` has no right on the auth tables.
- **`rr_admin_login`**: created by hand in `rr_admin`; the dashboard's `DATABASE_URL`. See
  [docs/runbook.md](../../docs/runbook.md#organizer-dashboard-appsadmin).

`src/__tests__/grants.test.ts` checks these rights on PGlite.

## Scripts

```sh
pnpm --filter @rr/db test                      # PGlite: migrations, steps, grants
pnpm --filter @rr/db db:generate --name <name> # new migration from schema changes
pnpm --filter @rr/db db:migrate                # apply to MIGRATE_DATABASE_URL (laptop only)
pnpm --filter @rr/db seed:organizers           # owner + demo viewer accounts (laptop only)
```

Migrations are expand/contract. Never edit a migration that has been applied.
