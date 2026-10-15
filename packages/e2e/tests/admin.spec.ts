import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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
  // The parent is served from another loopback origin. Chromium won't load a localhost frame into
  // `about:blank` or a public origin at all, so those parents can't tell a CSP block apart.
  let server: Server;
  let parent: string;

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      const { port } = server.address() as AddressInfo;
      res.setHeader("content-type", "text/html");
      if (req.url === "/framed") {
        res.end("<h1>Framed page</h1>");
        return;
      }
      const src = req.url === "/control" ? `http://localhost:${port}/framed` : `${ADMIN}/login`;
      res.end(`<iframe src="${src}" title="framed"></iframe>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    parent = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("control: the same parent can frame a page that allows it", async ({ page }) => {
    await page.goto(`${parent}/control`);
    await expect(
      page.frameLocator("iframe").getByRole("heading", { name: "Framed page" }),
    ).toBeVisible();
  });

  test("the browser refuses to frame /login", async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (msg) => messages.push(msg.text()));
    await page.goto(parent);
    await expect.poll(() => messages.join("\n")).toContain("frame-ancestors 'none'");
    await expect(page.frameLocator("iframe").getByRole("heading", { name: "Sign in" })).toHaveCount(
      0,
    );
  });
});

test.describe("Known gap: the dashboard's 404 page (FRW-21 deferred Should-fix)", () => {
  // The proxy only checks that a session cookie is present, so a forged one reaches the
  // prerendered `/_not-found`, which has no CSP nonce: the browser blocks all its scripts. The fix
  // is a dynamic `apps/admin/app/not-found.tsx`; once it lands, this test fails: assert
  // `watch(page).assertClean()` instead.
  test("an unknown path behind a forged cookie renders with its scripts blocked", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      { name: "better-auth.session_token", value: "forged.token", url: ADMIN },
    ]);
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("Content Security Policy")) violations.push(msg.text());
    });
    const response = await page.goto(`${ADMIN}/no-such-page`);
    expect(response?.status()).toBe(404);
    await expect(page.locator('aside[aria-label="Test mode"]')).toContainText(BANNER);
    await expect.poll(() => violations.length).toBeGreaterThan(0);
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
