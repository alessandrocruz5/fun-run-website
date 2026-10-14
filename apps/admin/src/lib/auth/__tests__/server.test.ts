import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "@rr/db";
import * as schema from "@rr/db/schema";
import { type OrganizerAccount, seedOrganizers } from "@rr/db/seed-organizers";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../../../../app/api/auth/[...all]/route";
import LoginPage from "../../../../app/login/page";
import { signInAsDemo } from "../demo-login";
import { canSeePersonalData } from "../roles";
import { getAuth, getDemoCredentials, redactLogMessage, signIn } from "../server";

// Real Better Auth on PGlite, migrated like production; only Next's request scope is faked.
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  request: new Headers(),
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

const ORIGIN = "http://localhost:3001";
const OWNER = { email: "owner@example.test", password: "owner-password-0123456789" };
const VIEWER = { email: "viewer@example.test", password: "viewer-password-0123456789" };
const ACCOUNTS: OrganizerAccount[] = [
  { role: "owner", name: "Clearwater Collective", ...OWNER },
  { role: "viewer", name: "Demo viewer", ...VIEWER },
];

let client: PGlite;
let db: Db;
let ip = 0;

function newVisitor(): string {
  ip += 1;
  const address = `192.0.2.${ip}`;
  state.jar.clear();
  state.request = new Headers({ "x-forwarded-for": address });
  return address;
}

function cookieHeader(): string {
  return [...state.jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
}

/** Signs in and returns request headers that carry the new session cookie. */
async function sessionHeaders(credentials: { email: string; password: string }) {
  newVisitor();
  expect(await signIn(credentials)).toBe("signed_in");
  return new Headers({ cookie: cookieHeader() });
}

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

function authRequest(method: string, path: string, body?: unknown): Request {
  return new Request(`${ORIGIN}/api/auth${path}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": newVisitor() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function count(table: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0]?.n ?? 0;
}

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(32).toString("base64"));
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  vi.stubEnv("DEMO_VIEWER_EMAIL", VIEWER.email);
  vi.stubEnv("DEMO_VIEWER_PASSWORD", VIEWER.password);
  client = new PGlite();
  const pglite = drizzle({ client, schema });
  await migrate(pglite, { migrationsFolder });
  db = pglite as unknown as Db;
  state.db = db;
  await seedOrganizers(db, ACCOUNTS);
});

beforeEach(() => {
  newVisitor();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

describe("sign-up", () => {
  const body = { email: "intruder@example.test", password: "intruder-password-0123", name: "X" };

  it("has no HTTP endpoint, in the route or in Better Auth's router", async () => {
    expect((await POST(authRequest("POST", "/sign-up/email", body))).status).toBe(404);
    expect((await getAuth().handler(authRequest("POST", "/sign-up/email", body))).status).toBe(404);
  });

  it("is refused server-side too, and creates no account", async () => {
    const users = await count("auth_users");
    await expect(getAuth().api.signUpEmail({ body })).rejects.toThrow();
    expect(await count("auth_users")).toBe(users);
  });
});

describe("auth route", () => {
  it.each([
    ["POST", "/change-password"],
    ["POST", "/change-email"],
    ["POST", "/update-user"],
    ["POST", "/delete-user"],
    ["POST", "/request-password-reset"],
    ["POST", "/reset-password"],
    ["GET", "/list-sessions"],
    ["POST", "/revoke-sessions"],
    ["POST", "/revoke-other-sessions"],
    ["GET", "/list-accounts"],
    ["POST", "/admin/create-user"],
    ["POST", "/admin/set-role"],
    ["POST", "/admin/impersonate-user"],
    ["GET", "/admin/list-users"],
    ["GET", "/sign-in/email"],
    ["POST", "/sign-in/email/"],
    ["POST", "//sign-up/email"],
  ])("answers 404 to %s %s", async (method, path) => {
    const handler = method === "GET" ? GET : POST;
    const response = await handler(authRequest(method, path, method === "GET" ? undefined : {}));
    expect(response.status).toBe(404);
  });

  it("forwards the allowed endpoints to Better Auth", async () => {
    const response = await POST(authRequest("POST", "/sign-in/email", { ...OWNER, password: "x" }));
    expect(response.status).toBe(401);
    expect((await GET(authRequest("GET", "/get-session"))).status).toBe(200);
  });
});

describe("roles", () => {
  it("gives neither role any admin-plugin power", async () => {
    const owner = await sessionHeaders(OWNER);
    const viewer = await sessionHeaders(VIEWER);
    const [ownerRow] = (
      await client.query<{ id: string }>("SELECT id FROM auth_users WHERE role = 'owner'")
    ).rows;
    const auth = getAuth();

    await expect(
      auth.api.createUser({
        body: { email: "new@example.test", password: "new-password-0123456", name: "New" },
        headers: owner,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      auth.api.setRole({ body: { userId: "any", role: "owner" }, headers: viewer }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      auth.api.impersonateUser({ body: { userId: ownerRow?.id ?? "" }, headers: viewer }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(auth.api.listUsers({ query: {}, headers: owner })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("lets only the owner see personal data", () => {
    expect(canSeePersonalData("owner")).toBe(true);
    expect(canSeePersonalData("viewer")).toBe(false);
  });
});

describe("signIn", () => {
  it("signs in with a seeded account and sets an httpOnly session cookie", async () => {
    expect(await signIn(OWNER)).toBe("signed_in");
    expect([...state.jar.keys()]).toEqual(["better-auth.session_token"]);
    const session = await getAuth().api.getSession({
      headers: new Headers({ cookie: cookieHeader() }),
    });
    expect(session?.user).toMatchObject({ email: OWNER.email, role: "owner" });
  });

  it("accepts the email in any case", async () => {
    expect(await signIn({ ...OWNER, email: OWNER.email.toUpperCase() })).toBe("signed_in");
  });

  it("refuses a wrong password or an unknown account the same way", async () => {
    expect(await signIn({ ...OWNER, password: "wrong-password-0123456" })).toBe("invalid");
    expect(await signIn({ email: "nobody@example.test", password: OWNER.password })).toBe(
      "invalid",
    );
    expect(await signIn({ email: "not-an-email", password: "x" })).toBe("invalid");
    expect(state.jar.size).toBe(0);
  });

  it("is rate-limited to 5 attempts a minute per IP, even with the right password", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await signIn({ ...OWNER, password: `guess-${attempt}-0123456789` })).toBe("invalid");
    }
    expect(await signIn(OWNER)).toBe("rate_limited");
    expect(state.jar.size).toBe(0);

    newVisitor();
    expect(await signIn(OWNER)).toBe("signed_in");
  });

  it("keeps the rate limit in the database, shared by every instance", async () => {
    const address = newVisitor();
    await signIn({ ...OWNER, password: "wrong-password-0123456" });
    const { rows } = await client.query<{ key: string; count: number }>(
      "SELECT key, count FROM auth_rate_limits WHERE key LIKE $1",
      [`${address}|%`],
    );
    expect(rows).toEqual([{ key: `${address}|/sign-in/email`, count: 1 }]);
  });

  it("stores neither the visitor's address nor their browser on the session", async () => {
    await client.exec("DELETE FROM auth_sessions");
    state.request = new Headers({
      "x-forwarded-for": "203.0.113.50",
      "user-agent": "TestBrowser/1",
    });
    expect(await signIn(VIEWER)).toBe("signed_in");
    const { rows } = await client.query("SELECT ip_address, user_agent FROM auth_sessions");
    expect(rows).toEqual([{ ip_address: null, user_agent: null }]);
  });
});

describe("demo button", () => {
  /** The `disabled` attribute, not the `disabled:` Tailwind variant in the class list. */
  const DISABLED = /<button[^>]*\sdisabled=""/;

  it("signs in as the viewer and goes to the dashboard", async () => {
    expect(await redirectTarget(signInAsDemo)).toBe("/");
    const session = await getAuth().api.getSession({
      headers: new Headers({ cookie: cookieHeader() }),
    });
    expect(session?.user.role).toBe("viewer");
  });

  it("never puts the password in the page, and its form posts no fields", async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);
    expect(html).not.toContain(VIEWER.password);
    expect(html).not.toContain(VIEWER.email);
    const demoForm = html
      .split("<form")
      .find((form) => form.includes("Explore the organizer demo"));
    expect(demoForm).toBeDefined();
    expect(demoForm).not.toContain("<input");
    expect(demoForm).not.toMatch(DISABLED);
  });

  it("is disabled, and refuses, when the demo credentials aren't set", async () => {
    vi.stubEnv("DEMO_VIEWER_PASSWORD", "");
    try {
      expect(getDemoCredentials()).toBeNull();
      const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
      const demoForm = html
        .split("<form")
        .find((form) => form.includes("Explore the organizer demo"));
      expect(demoForm).toMatch(DISABLED);
      expect(await redirectTarget(signInAsDemo)).toBe("/login?error=demo_unavailable");
    } finally {
      vi.stubEnv("DEMO_VIEWER_PASSWORD", VIEWER.password);
    }
  });

  it("shares the sign-in rate limit", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await redirectTarget(signInAsDemo)).toBe("/");
    }
    expect(await redirectTarget(signInAsDemo)).toBe("/login?error=rate_limited");
  });

  it("shows only fixed error messages, never text from the URL", async () => {
    const injected = "<script>alert(1)</script>";
    const html = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ error: injected }) }),
    );
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain('role="alert"');
    const limited = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ error: "rate_limited" }) }),
    );
    expect(limited).toContain("Too many sign-in attempts");
  });
});

describe("seedOrganizers", () => {
  it("re-running it rotates the password and signs the account out", async () => {
    const before = await count("auth_users");
    await sessionHeaders(OWNER);
    expect(await count("auth_sessions")).toBeGreaterThan(0);

    const rotated = "rotated-owner-password-0123";
    await seedOrganizers(db, [{ ...ACCOUNTS[0]!, password: rotated }]);
    expect(await count("auth_users")).toBe(before);
    const { rows } = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE u.role = 'owner'",
    );
    expect(rows[0]?.n).toBe(0);

    newVisitor();
    expect(await signIn(OWNER)).toBe("invalid");
    expect(await signIn({ ...OWNER, password: rotated })).toBe("signed_in");
    await seedOrganizers(db, ACCOUNTS);
  });

  it("stores lowercased emails, one credential account each", async () => {
    await seedOrganizers(db, [{ ...ACCOUNTS[1]!, email: VIEWER.email.toUpperCase() }]);
    const { rows } = await client.query<{ email: string; role: string; accounts: number }>(
      `SELECT u.email, u.role, count(a.id)::int AS accounts FROM auth_users u
       JOIN auth_accounts a ON a.user_id = u.id AND a.provider_id = 'credential'
       GROUP BY u.email, u.role ORDER BY u.role`,
    );
    expect(rows).toEqual([
      { email: OWNER.email, role: "owner", accounts: 1 },
      { email: VIEWER.email, role: "viewer", accounts: 1 },
    ]);
  });
});

describe("redactLogMessage", () => {
  it("drops a failed query's parameters and any email address", () => {
    const message =
      'Failed query: select "id" from "auth_users" where "email" = $1\nparams: owner@example.test';
    expect(redactLogMessage(message)).toBe(
      'Failed query: select "id" from "auth_users" where "email" = $1\nparams: [redacted]',
    );
    expect(redactLogMessage("User owner@example.test not found")).toBe("User [email] not found");
    expect(redactLogMessage("Invalid origin: https://evil.example")).toBe(
      "Invalid origin: https://evil.example",
    );
  });
});
