import { defineConfig } from "vitest/config";

// tsconfig keeps `jsx: preserve` for Next, so tests need their own JSX transform; the `@/` alias
// comes from tsconfig paths. The auth tests boot PGlite (in-process Postgres), which takes a moment.
// better-auth is inlined so its own `next/headers` import (nextCookies()) sees the tests' fake.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { tsconfigPaths: true },
  test: { hookTimeout: 30_000, server: { deps: { inline: ["better-auth"] } } },
});
