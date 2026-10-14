import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /organizer", () => {
  it("sends the visitor to the dashboard, never cached", () => {
    vi.stubEnv("ADMIN_URL", "https://admin.example.test");
    const res = GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://admin.example.test");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("fails fast when ADMIN_URL is missing or not a URL", () => {
    vi.stubEnv("ADMIN_URL", "");
    expect(() => GET()).toThrow(/ADMIN_URL/);
    vi.stubEnv("ADMIN_URL", "not a url");
    expect(() => GET()).toThrow(/ADMIN_URL/);
    vi.stubEnv("ADMIN_URL", "javascript:alert(1)");
    expect(() => GET()).toThrow(/ADMIN_URL/);
  });
});
