import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { buildCsp } from "../csp";

const NONCE = "bm9uY2UtZm9yLXRlc3Rz";

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split("; ").map((directive) => {
      const [name = "", ...values] = directive.split(" ");
      return [name, values];
    }),
  );
}

describe("buildCsp", () => {
  const prod = directives(buildCsp(NONCE, { isDev: false, upgradeInsecure: true }));
  const local = directives(buildCsp(NONCE, { isDev: false, upgradeInsecure: false }));
  const dev = directives(buildCsp(NONCE, { isDev: true, upgradeInsecure: false }));

  it("allows scripts by nonce, never inline", () => {
    const csp = buildCsp(NONCE, { isDev: false, upgradeInsecure: true });
    expect(csp.split(NONCE)).toHaveLength(2);
    expect(prod.get("script-src")).toContain(`'nonce-${NONCE}'`);
    expect(prod.get("script-src")).toContain("'strict-dynamic'");
    expect(prod.get("script-src")).not.toContain("'unsafe-inline'");
    expect(dev.get("script-src")).not.toContain("'unsafe-inline'");
  });

  it("allows eval only in development", () => {
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
    expect(local.get("script-src")).not.toContain("'unsafe-eval'");
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
  });

  it("names no other origin anywhere", () => {
    for (const isDev of [false, true]) {
      const csp = buildCsp(NONCE, { isDev, upgradeInsecure: true });
      expect(csp).not.toMatch(/https?:/);
    }
    expect(prod.get("connect-src")).toEqual(["'self'"]);
    expect(prod.has("frame-src")).toBe(false);
  });

  it("blocks plugins, framing, base-tag hijacks and off-site form posts", () => {
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
    expect(prod.get("base-uri")).toEqual(["'self'"]);
    expect(prod.get("default-src")).toEqual(["'self'"]);
    expect(prod.get("form-action")).toEqual(["'self'"]);
    expect(dev.get("form-action")).toEqual(["'self'"]);
  });

  it("upgrades insecure requests only when asked", () => {
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
    expect(local.has("upgrade-insecure-requests")).toBe(false);
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });
});

describe("next.config headers", () => {
  it("keeps no-store on /api/* and adds the security headers everywhere", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules).toContainEqual({
      source: "/api/:path*",
      headers: [{ key: "Cache-Control", value: "no-store" }],
    });

    const all = rules.find((rule) => rule.source === "/:path*");
    expect(all?.headers).toEqual([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
    ]);
    // The CSP needs a nonce per request (proxy.ts), and caching stays the API rule's business.
    const keys = rules.flatMap((rule) => rule.headers.map((header) => header.key.toLowerCase()));
    expect(keys).not.toContain("content-security-policy");
    expect(keys.filter((key) => key === "cache-control")).toHaveLength(1);
  });

  it("keeps the referrer on the origin without breaking server actions", async () => {
    // `no-referrer` would send `Origin: null` on same-origin POSTs, and Next's server-action
    // check rejects that: sign-in, the demo button and sign-out would all fail.
    const rules = (await nextConfig.headers?.()) ?? [];
    const referrer = rules
      .flatMap((rule) => rule.headers)
      .filter((header) => header.key === "Referrer-Policy");
    expect(referrer).toEqual([{ key: "Referrer-Policy", value: "same-origin" }]);
  });
});
