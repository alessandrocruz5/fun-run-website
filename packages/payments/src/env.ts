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

/**
 * The webhook's own secret key, from the PayMongo dashboard's webhook page. An API key pasted by
 * mistake (`sk_…`, `pk_…`) fails. The message never repeats the value.
 */
export const webhookSecretSchema = z
  .string()
  .regex(/^(?![sp]k_)\S+$/, "must be the PayMongo webhook's secret key, not an API key");

/**
 * Separate from `paymentsEnvSchema` so the form and the success page keep working where no webhook
 * is set up (local, Preview). Only the webhook route reads it.
 */
export const webhookEnvSchema = baseEnvSchema.extend({
  PAYMONGO_WEBHOOK_SECRET: webhookSecretSchema,
});

/** Read per call, never at module top level: `next build` runs with no environment variables. */
export function getWebhookEnv(source?: Record<string, string | undefined>) {
  return createEnv(webhookEnvSchema, source);
}
