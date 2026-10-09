import { baseEnvSchema, createEnv } from "@rr/env";
import { z } from "zod";

/** A Resend API key (`re_…`). The message never repeats the value. */
export const resendApiKeySchema = z
  .string()
  .regex(/^re_[A-Za-z0-9_]+$/, "must be a Resend API key (re_…)");

const ADDRESS = String.raw`[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+`;

/** `race@mail.example.com` or `Riverline Run <race@mail.example.com>`, on a domain verified in Resend. */
export const emailFromSchema = z
  .string()
  .regex(
    new RegExp(`^(?:${ADDRESS}|[^<>\\r\\n]+ <${ADDRESS}>)$`),
    "must be an address, or a name followed by <address>",
  );

export const emailEnvSchema = baseEnvSchema.extend({
  RESEND_API_KEY: resendApiKeySchema,
  EMAIL_FROM: emailFromSchema,
});

/** Read per call, never at module top level: `next build` runs with no environment variables. */
export function getEmailEnv(source?: Record<string, string | undefined>) {
  return createEnv(emailEnvSchema, source);
}
