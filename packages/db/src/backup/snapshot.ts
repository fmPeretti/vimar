/**
 * Taking a *consistent* copy of a live SQLite database.
 *
 * You cannot simply copy the file. The database runs in WAL mode, so recent
 * commits live in `vimar.db-wal` and not yet in `vimar.db`; a plain `cp` while
 * the app is running yields a torn snapshot that may be missing writes or be
 * outright corrupt.
 *
 * SQLite's online backup API handles this: it takes a read lock, follows any
 * concurrent writes, and produces a single self-contained file with no WAL
 * sidecar to carry around.
 */

import Database from "better-sqlite3";

export interface SnapshotResult {
  /** Tables found in the snapshot — a cheap sanity check that it isn't empty. */
  tables: string[];
  rowCounts: Record<string, number>;
}

const EXPECTED_TABLES = [
  "materials",
  "material_batches",
  "patterns",
  "pattern_materials",
  "tags",
  "pattern_tags",
  "craft_sessions",
  "craft_session_lines",
  "craft_consumptions",
  "events",
  "event_tasks",
];

/** Write a consistent copy of `sourcePath` to `destPath`. */
export async function snapshotDatabase(sourcePath: string, destPath: string): Promise<void> {
  const source = new Database(sourcePath);
  try {
    await source.backup(destPath);
  } finally {
    source.close();
  }
}

/**
 * Open a snapshot and confirm SQLite considers it sound and the schema is
 * present. A backup that has never been verified is a guess, not a backup.
 */
export function verifySnapshot(path: string): SnapshotResult {
  const db = new Database(path, { readonly: true });

  try {
    const integrity = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
    const verdict = integrity[0]?.integrity_check;
    if (verdict !== "ok") {
      throw new Error(`SQLite integrity check failed: ${verdict ?? "unknown"}`);
    }

    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);

    const missing = EXPECTED_TABLES.filter((name) => !tables.includes(name));
    if (missing.length > 0) {
      throw new Error(`Snapshot is missing expected tables: ${missing.join(", ")}`);
    }

    const rowCounts: Record<string, number> = {};
    for (const table of EXPECTED_TABLES) {
      const row = db.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number };
      rowCounts[table] = row.n;
    }

    return { tables, rowCounts };
  } finally {
    db.close();
  }
}
