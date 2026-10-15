import { expect, type Page, test } from "@playwright/test";
import { WEB } from "./origins";

// Runs against the built public site with a dummy webhook secret, no database and no
// PayMongo/Turnstile/Resend keys. Each test name says which Review constraint or requirement it proves.

const BANNER = "Fictional event · Test mode, no real payments";
const WEBHOOK = `${WEB}/api/webhooks/paymongo`;
const DUMMY_SECRET = "whsk_e2e_dummy_secret"; // gitleaks:allow (fake value from the config)

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

test.describe("Test mode banner on every page (Review constraint: test mode only)", () => {
  const pages: Array<{ path: string; status: number }> = [
    { path: "/", status: 200 },
    { path: "/privacy", status: 200 },
    { path: "/register/success", status: 200 },
    { path: "/register/cancelled", status: 200 },
    { path: "/no-such-page", status: 404 },
  ];

  for (const { path, status } of pages) {
    test(`${path} shows the banner (HTTP ${status})`, async ({ page }) => {
      const check = watch(page);
      const response = await page.goto(`${WEB}${path}`);
      expect(response?.status()).toBe(status);
      await expect(page.locator('aside[aria-label="Test mode"]')).toContainText(BANNER);
      check.assertClean();
    });
  }
});

test.describe("Content-Security-Policy (Sprint 3: CSP with a per-request nonce)", () => {
  for (const path of ["/", "/privacy"]) {
    test(`${path} has a nonce CSP, forbids framing and raises no violations`, async ({ page }) => {
      const check = watch(page);
      const response = await page.goto(`${WEB}${path}`);
      const csp = response?.headers()["content-security-policy"];
      expect(csp).toBeDefined();
      expect(nonceOf(csp)).toBeTruthy();
      expect(csp).toContain("frame-ancestors 'none'");

      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForLoadState("networkidle");
      check.assertClean();
    });

    test(`${path} gets a different nonce on every request`, async ({ request }) => {
      const first = await request.get(`${WEB}${path}`);
      const second = await request.get(`${WEB}${path}`);
      const a = nonceOf(first.headers()["content-security-policy"]);
      const b = nonceOf(second.headers()["content-security-policy"]);
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      expect(a).not.toBe(b);
    });
  }
});

test.describe("Static security headers (Sprint 3: security headers)", () => {
  for (const path of ["/", "/privacy"]) {
    test(`${path} sends nosniff, referrer-policy and permissions-policy`, async ({ request }) => {
      const headers = (await request.get(`${WEB}${path}`)).headers();
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBeTruthy();
      expect(headers["permissions-policy"]).toBeTruthy();
    });
  }
});

test.describe("API responses are never cached (Review constraint)", () => {
  test("/api/health is 200 {status: ok} with no-store", async ({ request }) => {
    const res = await request.get(`${WEB}/api/health`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("an unsigned webhook POST is 401 with no-store", async ({ request }) => {
    const res = await request.post(WEBHOOK, { data: "{}" });
    expect(res.status()).toBe(401);
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe("Webhook fails closed (Review constraint: signature checked before the database)", () => {
  // No DATABASE_URL exists in this run: any database access before the check would be a 500.
  test("a bogus Paymongo-Signature is 401 invalid_signature", async ({ request }) => {
    const res = await request.post(WEBHOOK, {
      headers: { "Paymongo-Signature": "t=1,te=deadbeef", "content-type": "application/json" },
      data: "{}",
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_signature" });
  });

  test("a missing Paymongo-Signature is 401 invalid_signature", async ({ request }) => {
    const res = await request.post(WEBHOOK, {
      headers: { "content-type": "application/json" },
      data: "{}",
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_signature" });
  });

  test("the route only handles POST (GET is 405)", async ({ request }) => {
    const res = await request.get(WEBHOOK);
    expect(res.status()).toBe(405);
  });
});

test.describe("Registration is paused without a Turnstile key (Review constraint: public form behind Turnstile)", () => {
  test("/#register says registration is paused and the pay button is disabled", async ({
    page,
  }) => {
    const check = watch(page);
    await page.goto(`${WEB}/#register`);
    await expect(page.getByText("Registration is paused", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /^PAY/ })).toBeDisabled();
    check.assertClean();
  });
});

test.describe("No third-party requests (Sprint 3: strict CSP, privacy)", () => {
  test("loading / requests only the site's own origin", async ({ page }) => {
    const origins = new Set<string>();
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.protocol === "http:" || url.protocol === "https:") origins.add(url.origin);
    });
    await page.goto(WEB);
    await page.waitForLoadState("networkidle");
    expect([...origins]).toEqual([WEB]);
    // No Turnstile key, so the widget script must not be on the page either.
    await expect(page.locator('script[src*="challenges.cloudflare.com"]')).toHaveCount(0);
  });
});

test.describe("Checkout page trusts only the server (Review constraint: payment status from the server)", () => {
  test("/register/success without the checkout cookie says it can't find a checkout", async ({
    page,
  }) => {
    const check = watch(page);
    await page.goto(`${WEB}/register/success`);
    await expect(page.getByRole("heading", { name: "We can't find your checkout." })).toBeVisible();
    check.assertClean();
  });

  test("/register/success ignores URL parameters claiming payment", async ({ page }) => {
    await page.goto(`${WEB}/register/success?status=paid&checkout_session_id=cs_forged`);
    await expect(page.getByRole("heading", { name: "We can't find your checkout." })).toBeVisible();
    await expect(page.getByText("CONFIRMED")).toHaveCount(0);
  });
});

test.describe("Privacy notice (Review constraint: RA 10173)", () => {
  test("/privacy states the retention period", async ({ page }) => {
    const check = watch(page);
    await page.goto(`${WEB}/privacy`);
    await expect(page.getByText("Your data is deleted within 7 days")).toBeVisible();
    check.assertClean();
  });
});

test.describe("Secrets stay on the server (Review constraint)", () => {
  test("the webhook secret is in neither the page, the RSC payload nor an API response", async ({
    page,
    request,
  }) => {
    await page.goto(WEB);
    expect(await page.content()).not.toContain(DUMMY_SECRET);

    const rsc = await request.get(WEB, { headers: { RSC: "1" } });
    expect(rsc.status()).toBe(200);
    expect(await rsc.text()).not.toContain(DUMMY_SECRET);

    const health = await request.get(`${WEB}/api/health`);
    expect(await health.text()).not.toContain(DUMMY_SECRET);
  });
});
