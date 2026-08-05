/**
 * Minimal `.env` loading for the command-line tools.
 *
 * The Next app gets this for free — Next reads `apps/web/.env.local` itself.
 * The backup and seed scripts are plain Node programs, so without this they'd
 * only see variables exported in the shell, which is a nasty surprise when you
 * have a perfectly good env file sitting right there.
 *
 * Existing variables always win, so a systemd `EnvironmentFile` or an explicit
 * `FOO=bar npm run …` is never overridden by a file on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findWorkspaceRoot } from "./paths";

/**
 * Searched in order. The app's own `.env.local` is included last so a single
 * file in the conventional Next location covers both the app and the CLI in
 * development.
 */
const CANDIDATES = [".env", ".env.local", join("apps", "web", ".env.local")];

function parse(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    if (!key) continue;

    let value = line.slice(eq + 1).trim();

    // Strip matching quotes; only then is an inline # a comment, since an
    // unquoted value could legitimately contain one.
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1);

    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash !== -1) value = value.slice(0, hash).trim();
    }

    values[key] = value;
  }

  return values;
}

let loaded = false;

/** Load env files once, without clobbering anything already set. */
export function loadEnvFiles(): void {
  if (loaded) return;
  loaded = true;

  const root = findWorkspaceRoot();

  for (const candidate of CANDIDATES) {
    const path = join(root, candidate);
    if (!existsSync(path)) continue;

    try {
      for (const [key, value] of Object.entries(parse(readFileSync(path, "utf8")))) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      console.warn(`Could not read ${candidate}:`, error);
    }
  }
}
