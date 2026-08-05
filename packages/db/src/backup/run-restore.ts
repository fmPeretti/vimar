/**
 * Restore (or just inspect) an encrypted backup.
 *
 *   npm run db:restore -- --list
 *   npm run db:restore -- --latest                # newest local backup
 *   npm run db:restore -- --remote --latest       # newest from the backup store
 *   npm run db:restore -- --remote <name>
 *   npm run db:restore -- backups/vimar-....db.gz.enc
 *   npm run db:restore -- --remote --latest --force   # overwrite the live database
 *
 * By default this restores to a *new* file and leaves the live database alone,
 * so you can open the result and confirm it before switching over. `--force`
 * overwrites the live database, moving the current one aside first.
 *
 * Everything here is streamed — nothing reads a whole backup into memory.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { decryptFile, requirePassphrase } from "./crypto";
import { loadEnvFiles } from "../env";
import { verifySnapshot } from "./snapshot";
import { resolveTarget, type BackupTarget } from "./target";
import { findWorkspaceRoot, resolveDatabasePath } from "../paths";

loadEnvFiles();

const BACKUP_SUFFIX = ".db.gz.enc";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

function humanSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function localBackups(backupDir: string): string[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((name) => name.endsWith(BACKUP_SUFFIX))
    .sort()
    .reverse();
}

/** Listing the remote must never stop you inspecting local backups. */
async function safeRemote(root: string): Promise<{ target: BackupTarget | null; error: string | null }> {
  try {
    return { target: await resolveTarget(root), error: null };
  } catch (error) {
    return { target: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const root = findWorkspaceRoot();
  const backupDir = process.env.BACKUP_DIR ?? join(root, "backups");
  const livePath = resolveDatabasePath();

  if (has("--list")) {
    const local = localBackups(backupDir);
    console.log(`Local backups in ${backupDir}:`);
    if (local.length === 0) console.log("  (none)");
    for (const name of local) {
      console.log(`  ${name}  ${humanSize(statSync(join(backupDir, name)).size)}`);
    }

    const { target, error } = await safeRemote(root);
    if (!target) {
      console.log(`\nBackup store unavailable: ${error}`);
      return;
    }

    console.log(`\nIn ${target.label}:`);
    try {
      const remote = await target.list();
      if (remote.length === 0) console.log("  (none)");
      for (const blob of remote) {
        console.log(`  ${blob.name}${blob.size ? `  ${humanSize(blob.size)}` : ""}`);
      }
    } catch (listError) {
      // A bad token or an offline network must not hide the local backups we
      // already listed — this command exists to answer "what do I have?".
      console.log(
        `  unavailable: ${listError instanceof Error ? listError.message : String(listError)}`,
      );
    }
    return;
  }

  const passphrase = requirePassphrase();

  // --- Locate the backup ---------------------------------------------------
  const wantsRemote = has("--remote");
  // `--remote` may name a file or stand alone (meaning "the newest one"), so
  // don't mistake a following flag such as `--latest` for a filename.
  const nextAfterRemote = arg("--remote");
  const remoteName =
    nextAfterRemote && !nextAfterRemote.startsWith("--") ? nextAfterRemote : undefined;

  // First bare argument is a local backup path. Filename isn't used to decide
  // whether something is a backup — the format is self-describing via its magic
  // header, so any path is accepted and validated on read.
  const positional = (() => {
    const rest = process.argv.slice(2);
    for (let i = 0; i < rest.length; i += 1) {
      const value = rest[i]!;
      if (value.startsWith("--")) {
        // Skip the value belonging to an option that takes one.
        if (value === "--out" || value === "--remote") i += 1;
        continue;
      }
      return value;
    }
    return undefined;
  })();

  let sourcePath: string;
  let label: string;
  let spooled: string | null = null;

  if (wantsRemote) {
    const target = await resolveTarget(root);
    const available = await target.list();
    const chosen = remoteName
      ? available.find((blob) => blob.name === remoteName)
      : available[0];

    if (!chosen) {
      throw new Error(
        remoteName
          ? `"${remoteName}" not found in ${target.label}. Run --list to see what's there.`
          : `No backups found in ${target.label}.`,
      );
    }

    mkdirSync(backupDir, { recursive: true });
    spooled = join(backupDir, `.incoming-${process.pid}${BACKUP_SUFFIX}`);
    await target.download(chosen.ref, spooled);
    sourcePath = spooled;
    label = `${chosen.name} (from ${target.label})`;
  } else if (positional) {
    sourcePath = isAbsolute(positional) ? positional : resolve(process.cwd(), positional);
    if (!existsSync(sourcePath)) throw new Error(`No such file: ${sourcePath}`);
    label = positional;
  } else if (has("--latest")) {
    const name = localBackups(backupDir)[0];
    if (!name) throw new Error(`No backups found in ${backupDir}. Run \`npm run db:backup\` first.`);
    sourcePath = join(backupDir, name);
    label = name;
  } else {
    throw new Error(
      "Nothing to restore. Pass a backup file, or --latest, or --remote [name]. Use --list to see what's available.",
    );
  }

  console.log(`Restoring from ${label} (${humanSize(statSync(sourcePath).size)})…`);

  const force = has("--force");
  const explicitOut = arg("--out");
  const outPath = explicitOut
    ? isAbsolute(explicitOut)
      ? explicitOut
      : resolve(process.cwd(), explicitOut)
    : force
      ? livePath
      : join(dirname(livePath), `restored-${new Date().toISOString().slice(0, 10)}.db`);

  /**
   * Opening a WAL database creates `-wal`/`-shm` sidecars next to it. They must
   * not survive the rename: a stale WAL left beside the restored file could be
   * replayed into it later and undo the restore.
   */
  const dropSidecars = (path: string) => {
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
  };

  // Decrypt to a temp file and verify *before* putting anything in place. GCM
  // only authenticates once the final byte is through, so plaintext must never
  // land directly on the destination.
  const tempPath = `${outPath}.incoming-${process.pid}`;
  mkdirSync(dirname(outPath), { recursive: true });

  try {
    await decryptFile(sourcePath, tempPath, passphrase);
    console.log(`Decrypted and decompressed to ${humanSize(statSync(tempPath).size)}.`);

    const { rowCounts } = verifySnapshot(tempPath);
    dropSidecars(tempPath);

    const summary = Object.entries(rowCounts)
      .filter(([, n]) => n > 0)
      .map(([table, n]) => `${table}=${n}`)
      .join(" ");
    console.log(`Verified restored database: ${summary || "empty database"}`);

    if (outPath === livePath && existsSync(livePath)) {
      const aside = `${livePath}.replaced-${Date.now()}`;
      copyFileSync(livePath, aside);
      console.log(`Moved the current database aside to ${aside}`);
      dropSidecars(livePath);
    }

    dropSidecars(outPath);
    renameSync(tempPath, outPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    dropSidecars(tempPath);
    throw error;
  } finally {
    if (spooled) rmSync(spooled, { force: true });
  }

  console.log(`\nRestored to ${outPath}`);

  if (outPath !== livePath) {
    console.log(
      "The live database was not touched. Inspect the restored file, then either\n" +
        `  move it into place manually, or re-run with --force to overwrite ${livePath}.`,
    );
  } else {
    console.log("Restart the app so it picks up the restored database.");
  }
}

main().catch((error: unknown) => {
  console.error(`\nRestore failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
