import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { loadEnvFiles } from "./env";
import { resolveDatabasePath } from "./paths";
import { schema } from "./schema";

function createConnection() {
  // Must happen before the path is resolved. A caller can't do this for us:
  // ES imports are evaluated before any statement in the importing module, so
  // this module would already have opened the database by then.
  loadEnvFiles();

  const path = resolveDatabasePath();
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  // Off by default in SQLite — without this the schema's cascades and
  // restricts are decoration rather than guarantees.
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  return drizzle(sqlite, { schema });
}

export type DrizzleDb = ReturnType<typeof createConnection>;

// Next.js dev reloads modules on every edit; without a global cache that would
// open a new SQLite handle each time until the process runs out of them.
const globalForDb = globalThis as unknown as { __vimarDb?: DrizzleDb };

export const db: DrizzleDb = globalForDb.__vimarDb ?? createConnection();

if (process.env.NODE_ENV !== "production") globalForDb.__vimarDb = db;

export { resolveDatabasePath };
