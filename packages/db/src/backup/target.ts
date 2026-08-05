/**
 * Where finished backups are sent.
 *
 * The interesting work — consistent snapshot, verify, compress, encrypt — is
 * the same wherever the bytes end up, so the destination is a small pluggable
 * interface. Adding S3 or Backblaze later means one more implementation and
 * nothing else changes.
 */

export interface StoredBackup {
  /** Filename as shown to the user. */
  name: string;
  /** Opaque handle the target uses to fetch or delete this backup. */
  ref: string;
  /** Bytes, or 0 when the target can't say cheaply. */
  size: number;
  uploadedAt: string;
}

export interface PublishResult {
  retained: number;
  dropped: number;
}

export interface BackupTarget {
  /** Human-readable description of where backups are going. */
  readonly label: string;

  /** Upload `localPath`, then enforce retention down to `keep` newest. */
  publish(localPath: string, name: string, keep: number): Promise<PublishResult>;

  /** Newest first. */
  list(): Promise<StoredBackup[]>;

  /** Stream a stored backup to `destPath`. */
  download(ref: string, destPath: string): Promise<void>;
}

export type TargetKind = "blob" | "git";

export function targetKind(): TargetKind {
  const raw = (process.env.BACKUP_TARGET ?? "blob").toLowerCase();
  if (raw === "blob" || raw === "git") return raw;
  throw new Error(`Unknown BACKUP_TARGET "${raw}". Use "blob" or "git".`);
}

/**
 * Imported lazily so choosing one target never loads the other's dependencies —
 * the git target shells out to git, the blob target pulls in the Vercel SDK.
 */
export async function resolveTarget(workspaceRoot: string): Promise<BackupTarget> {
  if (targetKind() === "git") {
    const { GitBranchTarget } = await import("./git-target");
    return new GitBranchTarget(workspaceRoot);
  }
  const { VercelBlobTarget } = await import("./blob-target");
  return new VercelBlobTarget();
}
