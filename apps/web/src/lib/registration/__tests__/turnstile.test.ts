import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTurnstileSiteKey, verifyTurnstile } from "../turnstile";

/**
 * Cloudflare's published test secret keys (developers.cloudflare.com/turnstile/troubleshooting/
 * testing). Against the real siteverify endpoint, with any token, `1x…` passes, `2x…` answers
 * `invalid-input-response` and `3x…` answers `timeout-or-duplicate` (a token already spent).
 * `fakeSiteverify` replays exactly those answers, so CI needs no network.
 */
const ALWAYS_PASS = "1x0000000000000000000000000000000AA";
const ALWAYS_FAIL = "2x0000000000000000000000000000000AA";
const ALREADY_SPENT = "3x0000000000000000000000000000000AA";

const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

function fakeSiteverify() {
  const spent = new Set<string>();
  return vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const body = new URLSearchParams(String(init?.body));
    const secret = body.get("secret");
    const token = body.get("response") ?? "";
    if (!token) return Response.json({ success: false, "error-codes": ["missing-input-response"] });
    if (secret === ALWAYS_FAIL) {
      return Response.json({ success: false, "error-codes": ["invalid-input-response"] });
    }
    if (secret === ALREADY_SPENT) {
      return Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] });
    }
    if (secret === ALWAYS_PASS) {
      return Response.json({ success: true, "error-codes": [], hostname: "example.com" });
    }
    // A real secret: a token works once.
    if (spent.has(token)) {
      return Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] });
    }
    spent.add(token);
    return Response.json({ success: true, "error-codes": [] });
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", ALWAYS_PASS);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  consoleError.mockRestore();
});

describe("verifyTurnstile", () => {
  it("accepts a token with Cloudflare's always-pass key", async () => {
    const fetch = fakeSiteverify();
    vi.stubGlobal("fetch", fetch);

    await expect(verifyTurnstile(TOKEN)).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init?.method).toBe("POST");
    // Secret and token only: no visitor IP is sent.
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      secret: ALWAYS_PASS,
      response: TOKEN,
    });
  });

  it("rejects a token with Cloudflare's always-fail key", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", ALWAYS_FAIL);
    vi.stubGlobal("fetch", fakeSiteverify());

    await expect(verifyTurnstile(TOKEN)).resolves.toEqual({
      ok: false,
      reason: "rejected",
      codes: ["invalid-input-response"],
    });
  });

  it("rejects a token Cloudflare has already seen", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", ALREADY_SPENT);
    vi.stubGlobal("fetch", fakeSiteverify());

    await expect(verifyTurnstile(TOKEN)).resolves.toEqual({
      ok: false,
      reason: "rejected",
      codes: ["timeout-or-duplicate"],
    });
  });

  it("accepts a token once and rejects the same token the second time", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x4AAAAAAA-a-real-looking-secret");
    vi.stubGlobal("fetch", fakeSiteverify());

    await expect(verifyTurnstile(TOKEN)).resolves.toEqual({ ok: true });
    await expect(verifyTurnstile(TOKEN)).resolves.toMatchObject({ ok: false, reason: "rejected" });
  });

  it.each([
    ["no token posted", null],
    ["an empty token", ""],
    ["a file instead of text", new File(["x"], "x.txt")],
    ["a token over Cloudflare's 2048-character limit", "a".repeat(2049)],
  ])("rejects %s without calling Cloudflare", async (_case, token) => {
    const fetch = fakeSiteverify();
    vi.stubGlobal("fetch", fetch);

    await expect(verifyTurnstile(token)).resolves.toEqual({ ok: false, reason: "missing" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed, without calling Cloudflare, when the secret key isn't set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const fetch = fakeSiteverify();
    vi.stubGlobal("fetch", fetch);

    await expect(verifyTurnstile(TOKEN)).resolves.toEqual({ ok: false, reason: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("turnstile.env_invalid", {
      error: "EnvValidationError",
      issues: [expect.stringContaining("TURNSTILE_SECRET_KEY")],
    });
  });

  it.each([
    [
      "can't be reached",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
    ["answers with a server error", () => new Response("down", { status: 503 })],
    ["answers with something that isn't JSON", () => new Response("<html>")],
    ["answers with an unexpected shape", () => Response.json({ ok: true })],
    [
      "reports an internal error",
      () => Response.json({ success: false, "error-codes": ["internal-error"] }),
    ],
    [
      "says the secret key is invalid",
      () => Response.json({ success: false, "error-codes": ["invalid-input-secret"] }),
    ],
  ])("fails closed when Cloudflare %s", async (_case, reply) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply()),
    );

    await expect(verifyTurnstile(TOKEN)).resolves.toMatchObject({
      ok: false,
      reason: "unavailable",
    });
  });

  it("never logs the token or the secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError(`fetch failed for ${TOKEN} ${ALWAYS_PASS}`);
      }),
    );
    await verifyTurnstile(TOKEN);

    expect(consoleError).toHaveBeenCalledWith("turnstile.verify_failed", { error: "TypeError" });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(ALWAYS_PASS);
  });
});

describe("getTurnstileSiteKey", () => {
  it("returns the site key", () => {
    expect(getTurnstileSiteKey({ TURNSTILE_SITE_KEY: "1x00000000000000000000AA" })).toBe(
      "1x00000000000000000000AA",
    );
  });

  it("returns null, and logs the key at fault, when it isn't set", () => {
    expect(getTurnstileSiteKey({})).toBeNull();
    expect(consoleError).toHaveBeenCalledWith("turnstile.site_key_missing", {
      error: "EnvValidationError",
      issues: [expect.stringContaining("TURNSTILE_SITE_KEY")],
    });
  });
});
