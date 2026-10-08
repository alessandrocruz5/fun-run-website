import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getDbEnv } from "./env";
import * as schema from "./schema";

/**
 * Any Drizzle Postgres database with our schema: Neon in the app, PGlite in tests. The driver's
 * raw-result type is left open (`any`) because the drivers' transaction signatures don't
 * otherwise unify; query builders and `.returning()` stay fully typed by the schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

let db: Db | undefined;

/**
 * The app's database client, created on first use. It connects as `rr_app_login` over Neon's
 * HTTP driver: every registration step is a single statement, so it needs no transactions.
 */
export function getDb(): Db {
  db ??= drizzle({ client: neon(getDbEnv().DATABASE_URL), schema });
  return db;
}
