import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isOrganizerRole, type OrganizerRole } from "./roles";
import { getAuth } from "./server";

export type OrganizerSession = { userId: string; name: string; role: OrganizerRole };

/**
 * The signed-in organizer, or null. The session cookie is looked up in the database every
 * request (deduplicated within one request), so a forged, expired or signed-out cookie is null.
 */
export const getSession = cache(async (): Promise<OrganizerSession | null> => {
  // headers() first: it makes the page dynamic before getAuth() reads the env, so `next build`
  // never reaches it.
  const requestHeaders = await headers();
  const result = await getAuth().api.getSession({ headers: requestHeaders });
  if (!result || !isOrganizerRole(result.user.role)) return null;
  return { userId: result.user.id, name: result.user.name, role: result.user.role };
});

/**
 * The real access check: call it in the dashboard layout and at the top of every page and data
 * function. A layout doesn't re-run on client-side navigation, and the proxy only looks for a
 * cookie, so neither is enough on its own.
 */
export async function requireSession(): Promise<OrganizerSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Ends the current session (if any) and clears its cookie. */
export async function endSession(): Promise<void> {
  const requestHeaders = await headers();
  await getAuth().api.signOut({ headers: requestHeaders });
}
