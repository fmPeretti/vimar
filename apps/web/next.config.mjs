import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A self-contained server.js plus only the node_modules it actually needs
  // (better-sqlite3's native binary included, per file tracing) — that's what
  // the Docker image runs, instead of shipping the whole repo.
  output: "standalone",
  // Pin tracing to the workspace root; a stray lockfile in the user's home
  // directory would otherwise be picked as the root.
  outputFileTracingRoot: join(here, "..", ".."),
  // Workspace packages ship raw TS/TSX — Next compiles them alongside the app,
  // so there is no separate build step to keep in sync.
  transpilePackages: ["@vimar/core", "@vimar/db", "@vimar/ui"],
  // better-sqlite3 is a native module; it must be required at runtime rather
  // than bundled.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
