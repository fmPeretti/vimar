import { timingSafeEqual } from "node:crypto";
import { isLoginLocked, recordFailedLogin, recordSuccessfulLogin, resetLoginLockout } from "@vimar/db";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Site-wide HTTP Basic Auth, enforced in Node.js middleware (not Edge) so it
 * can talk to SQLite directly — the lockout state lives in the database, not
 * in a per-instance memory that a second server process wouldn't share.
 *
 * Only set AUTH_USERNAME/AUTH_PASSWORD in production: leaving them unset (the
 * default for local dev) disables the check entirely.
 */
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const REALM = "Vimar Ops";
const LOCKOUT_MESSAGE =
  "Locked after too many failed attempts. Restart the server, or clear it in the database with:\n" +
  "  UPDATE auth_lockout SET failed_attempts = 0, locked = 0 WHERE id = 1;";

function unauthorized(body = "Authentication required."): NextResponse {
  return new NextResponse(body, {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}"` },
  });
}

function locked(): NextResponse {
  return new NextResponse(LOCKOUT_MESSAGE, { status: 423 });
}

/** Equal in content AND length-independent timing, without leaking length via a short-circuit. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do a same-cost comparison so a mismatched length isn't a faster path.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

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

  if (await isLoginLocked()) return locked();

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let suppliedUser = "";
  let suppliedPass = "";
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep === -1) return unauthorized();
    suppliedUser = decoded.slice(0, sep);
    suppliedPass = decoded.slice(sep + 1);
  } catch {
    return unauthorized();
  }

  if (safeEqual(suppliedUser, username) && safeEqual(suppliedPass, password)) {
    await recordSuccessfulLogin();
    return NextResponse.next();
  }

  const justLocked = await recordFailedLogin();
  return justLocked ? locked() : unauthorized("Wrong username or password.");
}
