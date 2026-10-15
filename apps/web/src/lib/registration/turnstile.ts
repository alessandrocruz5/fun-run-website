import { baseEnvSchema, createEnv, EnvValidationError } from "@rr/env";
import { z } from "zod";
import { logError } from "./confirm";

/**
 * Cloudflare Turnstile for the registration form. Server only: the secret key never reaches the
 * browser. `verifyTurnstile()` runs before the first database write or PayMongo call, and fails
 * closed: no token, a rejected token (invalid, expired or already used) and an unreachable
 * Cloudflare all stop the registration.
 */

export { HONEYPOT_FIELD, TURNSTILE_FIELD } from "./fields";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Cloudflare's documented maximum token length. */
const MAX_TOKEN_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 5_000;

/**
 * Vercel sets `VERCEL_ENV` to `production`, `preview` or `development`. `NODE_ENV` can't tell
 * production apart: it is `production` in Preview and in CI's `next start` too.
 */
const secretEnvSchema = baseEnvSchema.extend({
  TURNSTILE_SECRET_KEY: z.string().min(1),
  VERCEL_ENV: z.string().optional(),
});
const siteEnvSchema = baseEnvSchema.extend({
  TURNSTILE_SITE_KEY: z.string().min(1),
  VERCEL_ENV: z.string().optional(),
});

/** Cloudflare's dummy keys (`1x…` always passes, `2x…`/`3x…` fail). Real keys start `0x4`. */
const TEST_KEY = /^[123]x0{10}/;

/** True for Cloudflare's dummy site and secret keys, which must never run in production. */
export function isTurnstileTestKey(value: string): boolean {
  return TEST_KEY.test(value);
}

/**
 * The public site key for the widget, read per request: `next build` runs with no environment
 * variables. `null` when it isn't set, or is a Cloudflare test key in production, so the page
 * still renders and the form says registration is paused instead of the whole site returning 500.
 */
export function getTurnstileSiteKey(source?: Record<string, string | undefined>): string | null {
  let env: z.infer<typeof siteEnvSchema>;
  try {
    env = createEnv(siteEnvSchema, source);
  } catch (error) {
    logError("turnstile.site_key_missing", error);
    return null;
  }
  if (env.VERCEL_ENV === "production" && isTurnstileTestKey(env.TURNSTILE_SITE_KEY)) {
    // The key's name only, never its value.
    console.error("turnstile.test_key_in_production", { key: "TURNSTILE_SITE_KEY" });
    return null;
  }
  return env.TURNSTILE_SITE_KEY;
}

const siteverifySchema = z.object({
  success: z.boolean(),
  "error-codes": z.array(z.string()).default([]),
});

export type TurnstileResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * `missing`: no token was posted. `rejected`: Cloudflare says the token is invalid, expired
       * or already used. `unavailable`: no verdict (misconfigured, unreachable or erroring).
       */
      reason: "missing" | "rejected" | "unavailable";
      /** Cloudflare's error codes, e.g. `timeout-or-duplicate`. Codes only, never data. */
      codes?: string[];
    };

/** Cloudflare's own failure, as opposed to a verdict on the token. */
const SERVER_ERROR_CODES = new Set(["internal-error", "bad-request", "invalid-input-secret"]);

/**
 * Ask Cloudflare whether `token` (the form's `cf-turnstile-response`) is valid. Tokens are single
 * use and expire after 5 minutes, so a replayed token comes back `rejected`. The visitor's IP is
 * not sent: it is optional, and not needed for this check.
 */
export async function verifyTurnstile(
  token: FormDataEntryValue | null,
  source?: Record<string, string | undefined>,
): Promise<TurnstileResult> {
  if (typeof token !== "string" || token === "" || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "missing" };
  }

  let env: z.infer<typeof secretEnvSchema>;
  try {
    env = createEnv(secretEnvSchema, source);
  } catch (error) {
    if (error instanceof EnvValidationError) logError("turnstile.env_invalid", error);
    return { ok: false, reason: "unavailable" };
  }
  const secret = env.TURNSTILE_SECRET_KEY;
  // The always-pass test secret would switch the check off: refuse every test key in production.
  if (env.VERCEL_ENV === "production" && isTurnstileTestKey(secret)) {
    console.error("turnstile.test_key_in_production", { key: "TURNSTILE_SECRET_KEY" });
    return { ok: false, reason: "unavailable" };
  }

  let body: z.infer<typeof siteverifySchema>;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    // Cloudflare answers a rejected token with 200 `success: false`; a 4xx/5xx is its own fault.
    if (!response.ok)
      return { ok: false, reason: "unavailable", codes: [`http-${response.status}`] };
    body = siteverifySchema.parse(await response.json());
  } catch (error) {
    logError("turnstile.verify_failed", error);
    return { ok: false, reason: "unavailable" };
  }

  if (body.success) return { ok: true };
  const codes = body["error-codes"];
  const reason = codes.some((code) => SERVER_ERROR_CODES.has(code)) ? "unavailable" : "rejected";
  return { ok: false, reason, codes };
}
