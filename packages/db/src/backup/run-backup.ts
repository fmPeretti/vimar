/**
 * Take an encrypted, verified backup — and optionally upload it.
 *
 *   npm run db:backup            # write to backups/ only
 *   npm run db:backup -- --push  # ...and upload to the configured target
 *
 * Environment:
 *   BACKUP_PASSPHRASE       required — see crypto.ts
 *   BACKUP_DIR              default <root>/backups
 *   BACKUP_KEEP             how many to retain, default 14
 *   BACKUP_TARGET           "blob" (default) or "git"
 *
 *   blob target:
 *     BLOB_READ_WRITE_TOKEN required
 *     BACKUP_BLOB_PREFIX    default "backups/"
 *
 *   git target:
 *     BACKUP_GIT_REMOTE     default "origin"
 *     BACKUP_GIT_BRANCH     default "backups"
 *
 * Values are read from the environment first, then from `.env`, `.env.local`
 * and `apps/web/.env.local` at the workspace root.
 */

import { mkdirSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { encryptFile, requirePassphrase } from "./crypto";
import { loadEnvFiles } from "../env";
import { snapshotDatabase, verifySnapshot } from "./snapshot";
import { resolveTarget } from "./target";
import { findWorkspaceRoot, resolveDatabasePath } from "../paths";

loadEnvFiles();

const BACKUP_SUFFIX = ".db.gz.enc";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** `vimar-2026-08-05T14-32-08Z.db.gz.enc` — lexically sortable by age. */
function backupName(now: Date): string {
  return `vimar-${now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-")}${BACKUP_SUFFIX}`;
}

async function main() {
  const push = process.argv.includes("--push");
  const passphrase = requirePassphrase();

  const root = findWorkspaceRoot();
  const dbPath = resolveDatabasePath();
  const backupDir = process.env.BACKUP_DIR ?? join(root, "backups");
  const keep = Math.max(1, Number.parseInt(process.env.BACKUP_KEEP ?? "14", 10) || 14);

  // Resolve the target up front: a missing token should fail before spending
  // time snapshotting and encrypting.
  const target = push ? await resolveTarget(root) : null;

  mkdirSync(backupDir, { recursive: true });

  // 1. Consistent snapshot — never a plain file copy, see snapshot.ts.
  const stagingPath = join(backupDir, `.staging-${process.pid}.db`);
  console.log(`Snapshotting ${dbPath}…`);
  await snapshotDatabase(dbPath, stagingPath);

  try {
    // 2. Prove the snapshot is sound *before* encrypting it. Encrypting a
    //    corrupt database just produces a corrupt database you can't inspect.
    const { rowCounts } = verifySnapshot(stagingPath);
    const summary = Object.entries(rowCounts)
      .filter(([, n]) => n > 0)
      .map(([table, n]) => `${table}=${n}`)
      .join(" ");
    console.log(`Verified: ${summary || "empty database"}`);

    // 3. Compress, then encrypt — never the other way round. Ciphertext is
    //    indistinguishable from noise and will not compress at all.
    //    Streamed, so memory doesn't scale with database size.
    const name = backupName(new Date());
    const outPath = join(backupDir, name);
    await encryptFile(stagingPath, outPath, passphrase);

    const rawSize = statSync(stagingPath).size;
    const outSize = statSync(outPath).size;
    console.log(`Wrote ${name}  (${humanSize(rawSize)} → ${humanSize(outSize)} compressed + encrypted)`);

    pruneLocal(backupDir, keep);

    if (target) {
      console.log(`\nUploading to ${target.label}…`);
      const { retained, dropped } = await target.publish(outPath, name, keep);
      console.log(
        `Uploaded. ${retained} backup(s) retained${dropped > 0 ? `, ${dropped} removed` : ""}.`,
      );
    } else {
      console.log("\nNot uploaded. Re-run with `-- --push` to send it to the backup store.");
    }
  } finally {
    rmSync(stagingPath, { force: true });
    // The online backup API may leave sidecars next to the staging file.
    rmSync(`${stagingPath}-wal`, { force: true });
    rmSync(`${stagingPath}-shm`, { force: true });
  }
}

function pruneLocal(backupDir: string, keep: number): void {
  const files = readdirSync(backupDir)
    .filter((name) => name.endsWith(BACKUP_SUFFIX))
    .sort()
    .reverse();

  for (const stale of files.slice(keep)) {
    unlinkSync(join(backupDir, stale));
    console.log(`Pruned local ${stale}`);
  }
}

main().catch((error: unknown) => {
  console.error(`\nBackup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
