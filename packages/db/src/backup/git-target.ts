/**
 * A git branch as a backup destination.
 *
 * Superseded by the Vercel Blob target — kept because it works and costs
 * nothing to keep, and it's useful when there's no object store to hand. Select
 * it with `BACKUP_TARGET=git`.
 *
 * See `git.ts` for why the branch is a single parentless commit: encrypted data
 * never deltas, so an accumulating history would grow forever and never shrink.
 */

import { spawn } from "node:child_process";
import { createWriteStream, rmSync } from "node:fs";
import { basename } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  assertSafeBranch,
  commitTree,
  findRepoRoot,
  hasRemote,
  hashObject,
  makeTree,
  pushBranch,
  readExistingEntries,
  updateLocalRef,
  type GitTarget as GitRefs,
  type TreeEntry,
} from "./git";
import type { BackupTarget, PublishResult, StoredBackup } from "./target";

export class GitBranchTarget implements BackupTarget {
  readonly label: string;

  private readonly refs: GitRefs;

  constructor(workspaceRoot: string) {
    const repoRoot = findRepoRoot(workspaceRoot);
    if (!repoRoot) throw new Error("Not inside a git repository — cannot use the git backup target.");

    const remote = process.env.BACKUP_GIT_REMOTE ?? "origin";
    const branch = process.env.BACKUP_GIT_BRANCH ?? "backups";

    assertSafeBranch(repoRoot, branch);

    this.refs = { repoRoot, remote, branch };
    this.label = `git ${remote}/${branch}`;
  }

  async publish(localPath: string, name: string, keep: number): Promise<PublishResult> {
    const { repoRoot, remote, branch } = this.refs;

    const blob = hashObject(repoRoot, localPath);
    const existing = readExistingEntries(this.refs).filter((entry) => entry.name !== name);

    const entries: TreeEntry[] = [
      { mode: "100644", type: "blob", sha: blob, name: basename(localPath) },
      ...existing,
    ]
      .sort((a, b) => (a.name < b.name ? 1 : -1))
      .slice(0, keep);

    const dropped = existing.length + 1 - entries.length;

    const tree = makeTree(repoRoot, entries);
    const commit = commitTree(
      repoRoot,
      tree,
      `Backup ${name}\n\nRetaining ${entries.length} backup(s). This branch is intentionally a single parentless commit.`,
    );

    updateLocalRef(repoRoot, branch, commit);

    if (!hasRemote(repoRoot, remote)) {
      throw new Error(
        `Remote "${remote}" is not configured. Committed locally to refs/heads/${branch}; add the remote and re-run to publish.`,
      );
    }

    pushBranch(this.refs, commit);
    return { retained: entries.length, dropped };
  }

  async list(): Promise<StoredBackup[]> {
    return readExistingEntries(this.refs)
      .map((entry) => ({ name: entry.name, ref: entry.name, size: 0, uploadedAt: "" }))
      .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  }

  /** `git cat-file` streams to stdout, so pipe it to disk rather than buffering. */
  async download(ref: string, destPath: string): Promise<void> {
    const { repoRoot, remote, branch } = this.refs;
    const candidates = [`refs/remotes/${remote}/${branch}`, `refs/heads/${branch}`];

    for (const gitRef of candidates) {
      const child = spawn("git", ["-C", repoRoot, "cat-file", "blob", `${gitRef}:${ref}`], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      const exited = new Promise<number>((resolveExit) => child.on("close", resolveExit));

      try {
        await pipeline(child.stdout, createWriteStream(destPath));
        if ((await exited) === 0) return;
      } catch {
        // Try the next ref.
      }

      rmSync(destPath, { force: true });
    }

    throw new Error(`Could not read "${ref}" from the ${branch} branch.`);
  }
}
