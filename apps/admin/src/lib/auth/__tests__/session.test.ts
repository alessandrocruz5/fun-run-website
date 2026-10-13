import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "@rr/db";
import * as schema from "@rr/db/schema";
import { seedOrganizers } from "@rr/db/seed-organizers";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardLayout from "../../../../app/(dashboard)/layout";
import OverviewPage from "../../../../app/(dashboard)/page";
import LoginPage from "../../../../app/login/page";
import { proxy } from "../../../../proxy";
import { signIn } from "../server";
import { endSession, requireSession } from "../session";

// Real Better Auth on PGlite, migrated like production; only Next's request scope is faked.
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  /** The incoming request's headers, as `headers()` returns them. */
  request: new Headers(),
  /** Cookies the code under test set, as `cookies().set()` received them. */
  jar: new Map<string, string>(),
}));

vi.mock("@rr/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDb: () => state.db,
}));

const nextHeaders = vi.hoisted(() => ({
  headers: async () => state.request,
  cookies: async () => ({
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0 || value === "") state.jar.delete(name);
      else state.jar.set(name, value);
    },
  }),
}));

// Better Auth's nextCookies() imports `next/headers.js`: fake both specifiers.
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/headers.js", () => nextHeaders);

const migrationsFolder = fileURLToPath(
  new URL("../../../../../../packages/db/drizzle", import.meta.url),
);

const OWNER = { email: "owner@example.test", password: "owner-password-0123456789" };
const VIEWER = { email: "viewer@example.test", password: "viewer-password-0123456789" };

let client: PGlite;
let ip = 0;

/** A new visitor: fresh client address (sign-in is rate-limited per IP) and no cookies. */
function newVisitor() {
  ip += 1;
  state.jar.clear();
  state.request = new Headers({ "x-forwarded-for": `198.51.100.${ip}` });
}

/** The next request carries the cookies the last response set, like a browser would. */
function sendCookies(extra: Record<string, string> = {}) {
  const cookies = { ...Object.fromEntries(state.jar), ...extra };
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  state.request = new Headers({ ...Object.fromEntries(state.request), cookie });
}

async function signInAs(credentials: { email: string; password: string }) {
  newVisitor();
  expect(await signIn(credentials)).toBe("signed_in");
  sendCookies();
}

/** Where `run` redirected to, or null if it returned normally. */
async function redirectTarget(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;")) {
      return digest.split(";").slice(2, -2).join(";");
    }
    throw error;
  }
}

const FORGED_COOKIE = { "better-auth.session_token": "forged.token" };

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(32).toString("base64"));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3001");
  client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  state.db = db;
  await seedOrganizers(db as unknown as Db, [
    { role: "owner", name: "Clearwater Collective", ...OWNER },
    { role: "viewer", name: "Demo viewer", ...VIEWER },
  ]);
});

beforeEach(() => {
  newVisitor();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

describe("requireSession", () => {
  it("redirects to /login without a session cookie", async () => {
    expect(await redirectTarget(requireSession)).toBe("/login");
  });

  it("redirects to /login with a forged session cookie", async () => {
    sendCookies(FORGED_COOKIE);
    expect(await redirectTarget(requireSession)).toBe("/login");
  });

  it("returns the organizer's name and role, never the email", async () => {
    await signInAs(OWNER);
    const owner = await requireSession();
    expect(owner).toEqual({
      userId: expect.any(String),
      name: "Clearwater Collective",
      role: "owner",
    });

    await signInAs(VIEWER);
    expect(await requireSession()).toMatchObject({ name: "Demo viewer", role: "viewer" });
  });

  it("redirects once the session has expired in the database", async () => {
    await signInAs(VIEWER);
    expect(await redirectTarget(requireSession)).toBeNull();
    await client.exec("UPDATE auth_sessions SET expires_at = now() - interval '1 minute'");
    expect(await redirectTarget(requireSession)).toBe("/login");
  });

  it("redirects after sign-out, even if the old cookie is replayed", async () => {
    await signInAs(OWNER);
    const replayed = state.request;
    await endSession();
    expect(state.jar.size).toBe(0);
    state.request = replayed;
    expect(await redirectTarget(requireSession)).toBe("/login");
  });
});

describe("dashboard layout", () => {
  it("redirects to /login when signed out", async () => {
    expect(await redirectTarget(() => DashboardLayout({ children: null }))).toBe("/login");
  });

  it("redirects a forged cookie that the proxy lets through", async () => {
    const request = new NextRequest("http://localhost:3001/", {
      headers: { cookie: "better-auth.session_token=forged.token" },
    });
    expect(proxy(request).headers.get("x-middleware-next")).toBe("1");

    sendCookies(FORGED_COOKIE);
    expect(await redirectTarget(() => DashboardLayout({ children: null }))).toBe("/login");
  });

  it("renders for a signed-in organizer", async () => {
    await signInAs(VIEWER);
    expect(await redirectTarget(() => DashboardLayout({ children: null }))).toBeNull();
  });
});

describe("dashboard page", () => {
  // Client-side navigation re-renders the page without the layout: the page checks on its own.
  it("redirects to /login when signed out, without the layout", async () => {
    expect(await redirectTarget(OverviewPage)).toBe("/login");
    sendCookies(FORGED_COOKIE);
    expect(await redirectTarget(OverviewPage)).toBe("/login");
  });

  it("renders for a signed-in organizer", async () => {
    await signInAs(OWNER);
    expect(await redirectTarget(OverviewPage)).toBeNull();
  });
});

describe("login page", () => {
  it("is reachable signed out and sends signed-in organizers to the dashboard", async () => {
    const searchParams = Promise.resolve({});
    expect(await redirectTarget(() => LoginPage({ searchParams }))).toBeNull();
    await signInAs(VIEWER);
    expect(await redirectTarget(() => LoginPage({ searchParams }))).toBe("/");
  });
});

describe("proxy", () => {
  it.each(["/", "/registrations", "/registrations/RR-7K3QX9TD", "/registrations/export"])(
    "redirects %s to /login without a session cookie",
    (path) => {
      const response = proxy(new NextRequest(`http://localhost:3001${path}`));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost:3001/login");
    },
  );

  it("leaves /login and the auth API out of its matcher", async () => {
    const { config } = await import("../../../../proxy");
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    expect(matcher.test("/")).toBe(true);
    expect(matcher.test("/registrations")).toBe(true);
    expect(matcher.test("/login")).toBe(false);
    expect(matcher.test("/api/auth/sign-in/email")).toBe(false);
  });
});
