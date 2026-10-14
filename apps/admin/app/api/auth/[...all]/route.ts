import { getAuth } from "@/lib/auth/server";

/**
 * Better Auth's router, open only for the endpoints a signed-in organizer needs. Everything else
 * it ships (sign-up, password and email changes, listing or revoking sessions, the admin plugin's
 * user management) answers 404, and so does any endpoint a later Better Auth version adds. The
 * dashboard's own sign-in runs in a server action (lib/auth/server.ts) with the same rate limit.
 */
const ALLOWED = new Set(["GET /get-session", "POST /sign-in/email", "POST /sign-out"]);

const PREFIX = "/api/auth";

async function handle(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.slice(PREFIX.length);
  if (!ALLOWED.has(`${request.method} ${path}`)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return getAuth().handler(request);
}

export { handle as GET, handle as POST };
