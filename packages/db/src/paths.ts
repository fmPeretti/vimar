import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * Walk up from the cwd to the workspace root (the package.json that declares
 * `workspaces`). Lets `db:push`, `db:seed` and the Next dev server all land on
 * the same database file no matter which directory they were started from.
 */
export function findWorkspaceRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { workspaces?: unknown };
        if (pkg.workspaces) return dir;
      } catch {
        // Unreadable package.json — keep walking up.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

/** Kept side-effect free so `drizzle.config.ts` can call it without opening a connection. */
export function resolveDatabasePath(): string {
  const fromEnv = process.env.DATABASE_PATH;
  if (fromEnv) return isAbsolute(fromEnv) ? fromEnv : resolve(findWorkspaceRoot(), fromEnv);
  return join(findWorkspaceRoot(), "data", "vimar.db");
}
