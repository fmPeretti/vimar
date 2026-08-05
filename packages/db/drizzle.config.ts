import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// Deliberately self-contained: drizzle-kit loads this file through a CJS
// require, which can't resolve the ESM-style "./src/paths.js" specifier the
// rest of the package uses. Keep in sync with src/paths.ts.
function findWorkspaceRoot(start: string = process.cwd()): string {
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

const fromEnv = process.env.DATABASE_PATH;
const dbPath = fromEnv
  ? isAbsolute(fromEnv)
    ? fromEnv
    : resolve(findWorkspaceRoot(), fromEnv)
  : join(findWorkspaceRoot(), "data", "vimar.db");

// drizzle-kit opens the file directly rather than going through our client,
// so it needs the directory to exist first.
mkdirSync(dirname(dbPath), { recursive: true });

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: dbPath },
  verbose: true,
  strict: false,
});
