import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Sends visitors without a session cookie to /login before anything renders. It only redirects:
 * the cookie isn't verified here, so a forged one gets through, and the dashboard layout and every
 * data function check the session against the database themselves.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Everything except the login page, Better Auth's routes and static assets.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
