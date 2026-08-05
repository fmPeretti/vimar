import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, stateless session cookie for the site login. No session table —
 * the cookie carries its own expiry and an HMAC over it, so verifying a
 * session is just recomputing the signature, no database round trip.
 *
 * Deliberately separate from AUTH_PASSWORD: reusing the login password as a
 * signing key would mean a short/weak password also weakens every issued
 * cookie, and rotating the password would silently invalidate every session.
 */

export const SESSION_COOKIE = "vimar_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — a home tool, not a bank.

function secret(): string {
  const value = process.env.AUTH_SESSION_SECRET;
  if (!value) {
    throw new Error(
      "AUTH_SESSION_SECRET is not set. Generate one with `openssl rand -base64 32` " +
        "and set it alongside AUTH_USERNAME/AUTH_PASSWORD.",
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Equal in content and length-independent timing, without a short-circuit leaking length. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA); // same cost as the real path either way
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function createSessionToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
