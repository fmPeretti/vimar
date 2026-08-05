"use server";

import { isLoginLocked, recordFailedLogin, recordSuccessfulLogin } from "@vimar/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { createSessionToken, safeEqual, SESSION_COOKIE } from "@/lib/session";

const LOCKOUT_MESSAGE =
  "Locked after too many failed attempts. Restart the server, or run this " +
  "against the live database: UPDATE auth_lockout SET failed_attempts = 0, locked = 0 WHERE id = 1;";

export async function loginAction(
  username: string,
  password: string,
  from: string | null,
): Promise<ActionResult> {
  const expectedUser = process.env.AUTH_USERNAME;
  const expectedPass = process.env.AUTH_PASSWORD;
  if (!expectedUser || !expectedPass) {
    // Login isn't configured — nothing should have sent anyone here, but
    // don't leave them stuck on a form that can never succeed.
    redirect("/");
  }

  if (await isLoginLocked()) return { ok: false, error: LOCKOUT_MESSAGE };

  if (safeEqual(username, expectedUser) && safeEqual(password, expectedPass)) {
    await recordSuccessfulLogin();
    const jar = await cookies();
    jar.set(SESSION_COOKIE, createSessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect(from && from.startsWith("/") ? from : "/");
  }

  const justLocked = await recordFailedLogin();
  return { ok: false, error: justLocked ? LOCKOUT_MESSAGE : "Wrong username or password." };
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
