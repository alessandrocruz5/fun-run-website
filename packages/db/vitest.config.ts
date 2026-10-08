import { defineConfig } from "vitest/config";

// Tests run on PGlite (in-process Postgres) migrated from ./drizzle; booting it takes a moment.
export default defineConfig({
  test: { hookTimeout: 30_000 },
});
