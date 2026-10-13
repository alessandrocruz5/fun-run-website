"use server";

import { redirect } from "next/navigation";
import { getDemoCredentials, signIn } from "./server";

/**
 * The "Explore the organizer demo" button. Signs in as the viewer with credentials only the server
 * holds: the form posts no fields, so the password is never in the page or the request. It goes
 * through the same rate-limited sign-in as the password form.
 */
export async function signInAsDemo(): Promise<void> {
  const credentials = getDemoCredentials();
  if (!credentials) {
    console.error("auth.demo_unavailable", { reason: "env_missing" });
    redirect("/login?error=demo_unavailable");
  }
  const outcome = await signIn(credentials);
  if (outcome === "invalid") {
    // The env and the seeded account disagree: re-run seed:organizers with the same values.
    console.error("auth.demo_unavailable", { reason: "credentials_rejected" });
    redirect("/login?error=demo_unavailable");
  }
  redirect(outcome === "signed_in" ? "/" : `/login?error=${outcome}`);
}
