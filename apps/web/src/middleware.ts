import { resetLoginLockout } from "@vimar/db";
import { NextResponse, type NextRequest } from "next/server";
import { isValidSessionToken, SESSION_COOKIE } from "@/lib/session";

/**
 * Site-wide login gate. Enforced in Node.js middleware (not Edge) so
 * resetLoginLockout can talk to SQLite directly on process start — the
 * lockout state lives in the database, not in memory a second instance
 * wouldn't share. The actual login form, credential check and lockout
 * bookkeeping live in /login and lib/actions/auth-actions.ts; this file only
 * decides "does this request already have a valid session".
 *
 * Only set AUTH_USERNAME/AUTH_PASSWORD in production: leaving them unset (the
 * default for local dev) disables the check entirely.
 */
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

// Node middleware runs inside the same long-lived process as the server, so
// this module-level memo runs the reset exactly once per process start — the
// "restart the server to clear it" half of the lockout story.
let bootReset: Promise<void> | null = null;
function resetOnBoot(): Promise<void> {
  if (!bootReset) {
    bootReset = resetLoginLockout().catch((error: unknown) => {
      console.error("Could not reset login lockout on startup:", error);
    });
  }
  return bootReset;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const username = process.env.AUTH_USERNAME;
  const password = process.env.AUTH_PASSWORD;
  if (!username || !password) return NextResponse.next();

  await resetOnBoot();

  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  if (isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}
