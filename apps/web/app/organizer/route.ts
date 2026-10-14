import { baseEnvSchema, createEnv } from "@rr/env";
import { z } from "zod";

// ADMIN_URL is read per request, never at build time.
export const dynamic = "force-dynamic";

const adminEnvSchema = baseEnvSchema.extend({
  /** The organizer dashboard's public origin, e.g. `https://riverline-run-admin.vercel.app`. */
  ADMIN_URL: z.url({ protocol: /^https?$/ }),
});

/**
 * "See it from the organizer's side": the footer and the success page link here, and this sends
 * the visitor on to the dashboard, whose sign-in page offers the demo. A route rather than a
 * constant, so the address comes from the environment of the deployment (Preview or Production)
 * and the static pages never read it at build time.
 */
export function GET() {
  const { ADMIN_URL } = createEnv(adminEnvSchema);
  return new Response(null, {
    status: 307,
    headers: { location: ADMIN_URL, "cache-control": "no-store" },
  });
}
