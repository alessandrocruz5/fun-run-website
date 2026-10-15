import { defineConfig, devices } from "@playwright/test";

// Both apps are started from the existing build: `pnpm build` runs first
// (locally and in CI), so nothing here runs `next build`. If `.next` is
// missing, the servers won't start: that is the intended failure.
// Env values are dummies and there is no database: the specs must never
// depend on seed data or a live DB.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Never reuse a server already on 3000/3001 (a `next dev` with the real `.env.local`): a busy
  // port fails the run at once.
  webServer: [
    {
      command: "pnpm --filter @rr/web start",
      port: 3000,
      reuseExistingServer: false,
      timeout: 120_000,
      // `next start` also loads the app's `.env.local`, but never over a key the process already has:
      // the empty values make a local run match CI (no database, no PayMongo, Turnstile or Resend).
      env: {
        SITE_URL: "http://localhost:3000",
        PAYMONGO_WEBHOOK_SECRET: "whsk_e2e_dummy_secret", // gitleaks:allow (fake, test-only)
        NODE_ENV: "production",
        DATABASE_URL: "",
        PAYMONGO_SECRET_KEY: "",
        TURNSTILE_SITE_KEY: "",
        TURNSTILE_SECRET_KEY: "",
        RESEND_API_KEY: "",
        EMAIL_FROM: "",
        ADMIN_URL: "",
        VERCEL_ENV: "",
      },
    },
    {
      command: "pnpm --filter @rr/admin start",
      port: 3001,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        BETTER_AUTH_URL: "http://localhost:3001",
        BETTER_AUTH_SECRET: "e2e-dummy-secret-not-for-real-use-0000",
        // Never reachable: the Neon HTTP driver turns it into a host that doesn't parse, so every
        // query fails at once without touching the network.
        DATABASE_URL: "postgres://e2e:e2e@127.0.0.1:1/e2e",
        NODE_ENV: "production",
        DEMO_VIEWER_EMAIL: "",
        DEMO_VIEWER_PASSWORD: "",
        VERCEL_ENV: "",
      },
    },
  ],
});
