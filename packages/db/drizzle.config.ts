import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Migrations run as the Neon owner, from a laptop only. `MIGRATE_DATABASE_URL` lives in the
// gitignored packages/db/.env and is never set in Vercel; the app connects as `rr_app_login`
// through `DATABASE_URL` instead. `db:generate` needs no database, so only `db:migrate` needs it.
if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.MIGRATE_DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  ...(url ? { dbCredentials: { url } } : {}),
});
