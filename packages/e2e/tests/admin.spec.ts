import { expect, type Page, test } from "@playwright/test";
import { ADMIN } from "./origins";

// Runs against the built organizer dashboard with dummy Better Auth env and a dead DATABASE_URL:
// nothing here may need a database. Each describe name says which Review constraint it proves.
// `GET /api/auth/get-session` answers 500 here (the auth router's rate limiter is stored in the
// database), so its tests assert headers only, never the status. `/login` renders fine without one.

const BANNER = "Fictional event · Test mode, no real payments";
const DUMMY_SECRET = "e2e-dummy-secret-not-for-real-use-0000";

/** Records CSP violations and page errors; call `assertClean()` at the end of a page test. */
function watch(page: Page) {
  const violations: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("Content Security Policy") || text.includes("Refused to")) {
      violations.push(text);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return {
    assertClean() {
      expect(violations, "CSP violations").toEqual([]);
      expect(pageErrors, "page errors").toEqual([]);
    },
  };
}

function nonceOf(csp: string | undefined): string | undefined {
  return csp?.match(/'nonce-([^']+)'/)?.[1];
}

test.describe("Dashboard needs a session (Review constraint: organizer access)", () => {
  const paths = [
    "/",
    "/registrations",
    "/registrations/RR-7K3QX9TD",
    "/registrations/export",
    "/no-such-page",
  ];

  for (const path of paths) {
    test(`${path} redirects to /login when signed out`, async ({ request }) => {
      const res = await request.get(`${ADMIN}${path}`, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers().location).toMatch(/\/login$/);
    });
  }

  test("a prefetch request is redirected too", async ({ request }) => {
    const res = await request.get(`${ADMIN}/registrations`, {
      maxRedirects: 0,
      headers: { "Next-Router-Prefetch": "1" },
    });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toMatch(/\/login$/);
  });
});

test.describe("Login page (Review constraints: banner on every page, CSP)", () => {
  test("is reachable signed out, shows the banner and both sign-in forms", async ({ page }) => {
    const check = watch(page);
    const response = await page.goto(`${ADMIN}/login`);
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/login");

    await expect(page.locator('aside[aria-label="Test mode"]')).toContainText(BANNER);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

    // No demo credentials in this environment: the button renders but is disabled.
    await expect(page.getByRole("button", { name: "Explore the organizer demo" })).toBeDisabled();

    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

    await page.waitForLoadState("networkidle");
    check.assertClean();
  });

  test("sends a nonce CSP that forbids framing and off-site form posts", async ({ request }) => {
    const res = await request.get(`${ADMIN}/login`);
    const csp = res.headers()["content-security-policy"];
    expect(csp).toBeDefined();
    expect(nonceOf(csp)).toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
  });
});

test.describe("Security headers and no caching (Review constraints: API never cached)", () => {
  for (const path of ["/login", "/api/auth/get-session"]) {
    test(`${path} sends nosniff and a same-origin referrer policy`, async ({ request }) => {
      const res = await request.get(`${ADMIN}${path}`);
      const headers = res.headers();
      expect(headers["x-content-type-options"]).toBe("nosniff");
      // Not `no-referrer`: that makes same-origin POSTs carry `Origin: null`, which Next rejects
      // for Server Actions.
      expect(headers["referrer-policy"]).toBe("same-origin");
    });
  }

  for (const path of ["/api/auth/get-session", "/api/auth/sign-up/email"]) {
    test(`${path} is not cacheable`, async ({ request }) => {
      const res = await request.get(`${ADMIN}${path}`);
      expect(res.headers()["cache-control"]).toContain("no-store");
    });
  }
});

test.describe("No sign-up and a closed auth allowlist (Review constraint: organizer access)", () => {
  test("POST /api/auth/sign-up/email answers 404 not_found", async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/auth/sign-up/email`, {
      data: { email: "intruder@example.com", password: "correct-horse-battery", name: "Intruder" },
    });
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  test("POST /api/auth/admin/create-user answers 404", async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/auth/admin/create-user`, {
      data: { email: "intruder@example.com", password: "correct-horse-battery", name: "Intruder" },
    });
    expect(res.status()).toBe(404);
  });

  test("GET /api/auth/list-sessions answers 404", async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/auth/list-sessions`);
    expect(res.status()).toBe(404);
  });
});

test.describe("Not framable (Review constraint: CSP frame-ancestors 'none')", () => {
  test("the login form does not render inside an iframe", async ({ page }) => {
    // No watch() here: a frame-ancestors block logs a console error on the parent page.
    await page.goto("about:blank");
    await page.setContent(`<iframe src="${ADMIN}/login" title="victim"></iframe>`);
    await page.waitForLoadState("load");

    // The browser swaps a blocked frame for its own error page, so the frame did load something.
    await expect
      .poll(() => page.frames().map((f) => f.url()))
      .toContain("chrome-error://chromewebdata/");

    const framed = page.frameLocator("iframe");
    await expect(framed.getByRole("heading", { name: "Sign in" })).toHaveCount(0, {
      timeout: 2_000,
    });
  });
});

test.describe("Secrets stay on the server (Review constraint: secrets)", () => {
  test("the login HTML contains neither the auth secret nor a database URL", async ({
    request,
  }) => {
    const res = await request.get(`${ADMIN}/login`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).not.toContain(DUMMY_SECRET);
    expect(html).not.toContain("postgres://");
  });
});
