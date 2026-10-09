import { baseEnvSchema, createEnv } from "@rr/env";
import { z } from "zod";

/**
 * Test mode only: a live key (`sk_live_…`), a public key (`pk_…`) or anything else fails. The
 * message never repeats the value.
 */
export const testSecretKeySchema = z
  .string()
  .regex(/^sk_test_[A-Za-z0-9]+$/, "must be a PayMongo test secret key (sk_test_…)");

export const paymentsEnvSchema = baseEnvSchema.extend({
  PAYMONGO_SECRET_KEY: testSecretKeySchema,
});

/** Read per call, never at module top level: `next build` runs with no environment variables. */
export function getPaymentsEnv(source?: Record<string, string | undefined>) {
  return createEnv(paymentsEnvSchema, source);
}
