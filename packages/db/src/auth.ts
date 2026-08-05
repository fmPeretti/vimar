import { eq } from "drizzle-orm";
import { db as defaultDb, type DrizzleDb } from "./client";
import { authLockout } from "./schema";

const ROW_ID = 1;

/** After this many wrong passwords in a row, the site locks regardless of what's typed next. */
export const MAX_LOGIN_ATTEMPTS = 3;

type LockoutRow = typeof authLockout.$inferSelect;

async function ensureRow(db: DrizzleDb): Promise<LockoutRow> {
  const [existing] = await db.select().from(authLockout).where(eq(authLockout.id, ROW_ID));
  if (existing) return existing;

  try {
    await db.insert(authLockout).values({ id: ROW_ID, failedAttempts: 0, locked: false });
  } catch {
    // Another request inserted it between our select and this insert — fine,
    // the row exists either way, so just re-read it below.
  }
  const [row] = await db.select().from(authLockout).where(eq(authLockout.id, ROW_ID));
  return row!;
}

export async function isLoginLocked(db: DrizzleDb = defaultDb): Promise<boolean> {
  return (await ensureRow(db)).locked;
}

/**
 * Clears the lock unconditionally. Called once when the app process starts,
 * so a server restart always reopens the door — and available to call by
 * hand (a script, a REPL) for the "flip it in the database" path.
 */
export async function resetLoginLockout(db: DrizzleDb = defaultDb): Promise<void> {
  await ensureRow(db);
  await db
    .update(authLockout)
    .set({ failedAttempts: 0, locked: false, updatedAt: new Date().toISOString() })
    .where(eq(authLockout.id, ROW_ID));
}

/** Records one wrong password. Returns true if this attempt just tripped the lock. */
export async function recordFailedLogin(db: DrizzleDb = defaultDb): Promise<boolean> {
  const row = await ensureRow(db);
  if (row.locked) return true;

  const failedAttempts = row.failedAttempts + 1;
  const locked = failedAttempts >= MAX_LOGIN_ATTEMPTS;
  await db
    .update(authLockout)
    .set({ failedAttempts, locked, updatedAt: new Date().toISOString() })
    .where(eq(authLockout.id, ROW_ID));
  return locked;
}

/** A correct password resets the *count*, but does not clear an existing lock. */
export async function recordSuccessfulLogin(db: DrizzleDb = defaultDb): Promise<void> {
  const row = await ensureRow(db);
  if (row.failedAttempts === 0) return;
  await db
    .update(authLockout)
    .set({ failedAttempts: 0, updatedAt: new Date().toISOString() })
    .where(eq(authLockout.id, ROW_ID));
}
