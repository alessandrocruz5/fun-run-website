import { authSchema, type Db, getDb } from "@rr/db";
import { baseEnvSchema, createEnv } from "@rr/env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { ac, roles } from "./roles";

export const authEnvSchema = baseEnvSchema.extend({
  /** Signs session cookies: `openssl rand -base64 32`. Server only. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** The dashboard's public origin, e.g. `https://<admin>.vercel.app`. Sign-in trusts only it. */
  BETTER_AUTH_URL: z.url(),
});

type AuthEnv = z.infer<typeof authEnvSchema>;

/** Read per call, never at module top level: `next build` runs with no environment variables. */
export function getAuthEnv(source?: Record<string, string | undefined>): AuthEnv {
  return createEnv(authEnvSchema, source);
}

export type Credentials = { email: string; password: string };

const demoEnvSchema = baseEnvSchema.extend({
  DEMO_VIEWER_EMAIL: z.email(),
  DEMO_VIEWER_PASSWORD: z.string().min(1),
});

/**
 * The demo viewer's credentials from the env, or null when they aren't set (the demo button is
 * then disabled). Server only: the password is used here and never sent to a browser.
 */
export function getDemoCredentials(
  source: Record<string, string | undefined> = process.env,
): Credentials | null {
  const result = demoEnvSchema.safeParse(source);
  if (!result.success) return null;
  return { email: result.data.DEMO_VIEWER_EMAIL, password: result.data.DEMO_VIEWER_PASSWORD };
}

/** Better Auth's HTTP routes live here; app/api/auth/[...all] forwards a few of them. */
const BASE_PATH = "/api/auth";

/**
 * Strip personal data (RA 10173) from a Better Auth log message. A failed query's message quotes
 * its parameters after `params:`, and a sign-in parameter is an email address.
 */
export function redactLogMessage(message: string): string {
  return message
    .replace(/params:[\s\S]*$/, "params: [redacted]")
    .replace(/[^\s@<>"',;:()]+@[^\s@<>"',;:()]+/g, "[email]");
}

function describeLogArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    const code = (arg as { code?: unknown }).code ?? (arg.cause as { code?: unknown })?.code;
    return typeof code === "string" ? { error: arg.name, code } : { error: arg.name };
  }
  return typeof arg === "string" ? redactLogMessage(arg) : typeof arg;
}

export function createAuth(db: Db, env: AuthEnv) {
  return betterAuth({
    appName: "Riverline Run organizer",
    baseURL: env.BETTER_AUTH_URL,
    basePath: BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    // No sign-up: the two accounts come from `pnpm --filter @rr/db seed:organizers` only.
    emailAndPassword: { enabled: true, disableSignUp: true },
    disabledPaths: ["/sign-up/email"],
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    // Only HTTP requests through the router are rate-limited, never `auth.api.*` calls: that is
    // why `signIn()` below goes through `auth.handler`. Stored in Postgres so every instance shares
    // the count. Keys are `<ip>|<path>`; the IP comes from Vercel's `x-forwarded-for`.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    databaseHooks: {
      session: {
        create: {
          // Demo visitors share one account: keep neither their address nor their browser.
          before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
      },
    },
    logger: {
      level: "warn",
      log(level, message, ...args) {
        const log = level === "error" ? console.error : console.warn;
        log(`auth.${level}`, {
          message: redactLogMessage(message),
          args: args.map(describeLogArg),
        });
      },
    },
    telemetry: { enabled: false },
    // nextCookies() must stay last: it writes the cookies of `auth.api.*` calls in server actions.
    plugins: [admin({ ac, roles, defaultRole: "viewer", adminRoles: ["owner"] }), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

/** The dashboard's Better Auth instance, created on first use (never during `next build`). */
export function getAuth(): Auth {
  auth ??= createAuth(getDb(), getAuthEnv());
  return auth;
}

export type SignInOutcome = "signed_in" | "invalid" | "rate_limited" | "unavailable";

/**
 * Sign in from a server action, through Better Auth's router rather than `auth.api.signInEmail`,
 * so the sign-in rate limit applies (5 per minute per IP). The request never leaves the server.
 * On success the session cookie is set on the action's response.
 */
export async function signIn(credentials: Credentials): Promise<SignInOutcome> {
  const incoming = await headers();
  const { BETTER_AUTH_URL } = getAuthEnv();
  const request = new Request(`${BETTER_AUTH_URL}${BASE_PATH}/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The browser's origin was already checked by Next.js for the server action.
      origin: BETTER_AUTH_URL,
      // Vercel sets this to the client's address, so the limit is per visitor.
      ...forwardedFor(incoming),
    },
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  });

  let response: Response;
  try {
    response = await getAuth().handler(request);
  } catch (error) {
    console.error("auth.sign_in_failed", describeLogArg(error));
    return "unavailable";
  }

  if (response.status === 429) {
    console.warn("auth.sign_in_rejected", { reason: "rate_limited" });
    return "rate_limited";
  }
  if (response.status === 400 || response.status === 401) {
    console.warn("auth.sign_in_rejected", { reason: "invalid_credentials" });
    return "invalid";
  }
  if (!response.ok) {
    console.error("auth.sign_in_failed", { status: response.status });
    return "unavailable";
  }

  const cookieStore = await cookies();
  for (const [name, attributes] of parseSetCookieHeader(response.headers.get("set-cookie") ?? "")) {
    cookieStore.set(name, attributes.value, toCookieOptions(attributes));
  }
  return "signed_in";
}

function forwardedFor(incoming: Headers): Record<string, string> {
  const value = incoming.get("x-forwarded-for");
  return value ? { "x-forwarded-for": value } : {};
}
