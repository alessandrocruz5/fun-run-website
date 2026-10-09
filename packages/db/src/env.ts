import { baseEnvSchema, createEnv } from "@rr/env";
import { z } from "zod";

export const dbEnvSchema = baseEnvSchema.extend({
  /** Pooled Neon URL for `rr_app_login`, never the owner. */
  DATABASE_URL: z.url(),
});

/** Read per call, never at module top level: `next build` runs with no environment variables. */
export function getDbEnv(source?: Record<string, string | undefined>) {
  return createEnv(dbEnvSchema, source);
}
