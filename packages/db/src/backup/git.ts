/**
 * Publishing backups to a git branch.
 *
 * Two things make this awkward with ordinary git commands, and both are why
 * this module uses plumbing instead:
 *
 * 1. Encrypted data is incompressible and never deltas against the previous
 *    version, so every backup is a full new blob. A normal accumulating history
 *    would grow without bound and *never shrink*, because git keeps everything
 *    a commit ever referenced.
 *
 * 2. Checking out a branch to add a file would trample the working tree.
 *
 * So: build the commit directly out of blobs with `hash-object` / `mktree` /
 * `commit-tree`, and give the branch **no parent**. The branch is always
 * exactly one commit referencing exactly the files we want to keep, so the
 * remote's size is bounded by the retention count rather than by history.
 *
 * That means force-pushing, which is correct here — the branch is a
 * machine-managed artifact, not shared work — but it is guarded below so it can
 * never point at a branch anyone is actually developing on.
 */

import { execFileSync } from "node:child_process";

export interface GitTarget {
  repoRoot: string;
  remote: string;
  branch: string;
}

export interface TreeEntry {
  mode: string;
  type: string;
  sha: string;
  name: string;
}

function git(repoRoot: string, args: string[], input?: Buffer): string {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    // execFileSync inherits stderr by default; capture it so probing commands
    // don't print "couldn't find remote ref" when a branch simply doesn't exist yet.
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/** Run a command that is *expected* to fail sometimes, swallowing its output. */
function gitQuiet(repoRoot: string, args: string[]): string | null {
  try {
    return git(repoRoot, args);
  } catch {
    return null;
  }
}

/**
 * Refuse to publish onto a branch that someone might be working on. Without
 * this, a mistyped `BACKUP_GIT_BRANCH` would force-push over real work.
 */
export function assertSafeBranch(repoRoot: string, branch: string): void {
  const protectedNames = new Set(["main", "master", "develop", "dev", "trunk", "HEAD"]);

  if (protectedNames.has(branch)) {
    throw new Error(
      `Refusing to use "${branch}" as the backup branch — it force-pushes, and that name looks like a working branch. Use something like "backups".`,
    );
  }

  // `symbolic-ref` rather than `rev-parse --abbrev-ref`: it still reports the
  // branch name before the repository's first commit, when HEAD is unborn.
  const current = gitQuiet(repoRoot, ["symbolic-ref", "--short", "HEAD"]);
  if (current === branch) {
    throw new Error(
      `Refusing to publish backups to "${branch}" because it is the currently checked-out branch.`,
    );
  }
}

export function findRepoRoot(from: string): string | null {
  return gitQuiet(from, ["rev-parse", "--show-toplevel"]);
}

export function hasRemote(repoRoot: string, remote: string): boolean {
  const remotes = gitQuiet(repoRoot, ["remote"]);
  return remotes ? remotes.split("\n").includes(remote) : false;
}

/** Write a file into the object store and return its blob SHA. */
export function hashObject(repoRoot: string, filePath: string): string {
  return git(repoRoot, ["hash-object", "-w", "--", filePath]);
}

/** Entries currently on the backup branch, preferring the remote's view of it. */
export function readExistingEntries(target: GitTarget): TreeEntry[] {
  const { repoRoot, remote, branch } = target;

  let ref: string | null = null;

  if (hasRemote(repoRoot, remote)) {
    // A missing branch on the remote is normal on the first run.
    if (gitQuiet(repoRoot, ["fetch", "--quiet", remote, `${branch}:refs/remotes/${remote}/${branch}`]) !== null) {
      ref = `refs/remotes/${remote}/${branch}`;
    }
  }

  if (!ref && gitQuiet(repoRoot, ["rev-parse", "--verify", `refs/heads/${branch}`])) {
    ref = `refs/heads/${branch}`;
  }

  if (!ref) return [];

  const listing = gitQuiet(repoRoot, ["ls-tree", ref]);
  if (!listing) return [];

  return listing
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // "<mode> <type> <sha>\t<name>"
      const [meta, name] = line.split("\t");
      const [mode, type, sha] = (meta ?? "").split(/\s+/);
      return { mode: mode ?? "100644", type: type ?? "blob", sha: sha ?? "", name: name ?? "" };
    })
    .filter((entry) => entry.sha && entry.name);
}

export function makeTree(repoRoot: string, entries: TreeEntry[]): string {
  const body = entries
    .map((entry) => `${entry.mode} ${entry.type} ${entry.sha}\t${entry.name}`)
    .join("\n");
  return git(repoRoot, ["mktree"], Buffer.from(`${body}\n`, "utf8"));
}

/** Create a parentless commit — this is what keeps the branch to one commit. */
export function commitTree(repoRoot: string, tree: string, message: string): string {
  return execFileSync("git", ["-C", repoRoot, "commit-tree", tree, "-m", message], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      // Unattended runs may have no user identity configured.
      GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? "Vimar Backup",
      GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? "backup@vimar.local",
      GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? "Vimar Backup",
      GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? "backup@vimar.local",
    },
  }).trim();
}

export function updateLocalRef(repoRoot: string, branch: string, commit: string): void {
  git(repoRoot, ["update-ref", `refs/heads/${branch}`, commit]);
}

export function pushBranch(target: GitTarget, commit: string): void {
  const { repoRoot, remote, branch } = target;
  git(repoRoot, ["push", "--force", remote, `${commit}:refs/heads/${branch}`]);
}
