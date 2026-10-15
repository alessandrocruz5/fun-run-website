import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { buildCsp } from "@/lib/csp";

/** Reachable without a session: the login page and Better Auth's routes. Exact paths only. */
function isPublic(pathname: string): boolean {
  return pathname === "/login" || pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

/**
 * Gives every response a fresh nonce and its Content-Security-Policy (the request gets the policy
 * too, so Next finds the nonce and adds it to its own scripts), and sends visitors without a
 * session cookie to /login before anything renders. It only redirects: the cookie isn't verified
 * here, so a forged one gets through, and the dashboard layout and every data function check the
 * session against the database themselves.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, {
    isDev: process.env.NODE_ENV === "development",
    upgradeInsecure: process.env.VERCEL_ENV === "production",
  });

  let response: NextResponse;
  if (isPublic(request.nextUrl.pathname) || getSessionCookie(request)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    response = NextResponse.redirect(new URL("/login", request.url));
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except static assets, so /login and /api/auth/* get the policy too. Unlike Next's
  // CSP guide there is no `missing` prefetch entry: here the proxy also redirects, and skipping
  // prefetches would skip their redirect too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
