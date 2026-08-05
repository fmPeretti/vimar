# Multi-stage build for the @vimar/web workspace. better-sqlite3 is a native
# module, so it must be installed *inside* this image (Linux/glibc) rather
# than copied in from the host — `npm ci` below does that as part of the
# build, targeting this same base image every stage uses.
FROM node:22-bookworm-slim AS base
WORKDIR /repo

# --- deps: install once, cached as long as the lockfile + manifests match ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

# --- builder: full source, produce the standalone server ---
FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: just the traced server + its node_modules, nothing else ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js's file tracing already narrowed node_modules down to what
# server.js actually requires at runtime — better-sqlite3's native binary
# included (see apps/web/next.config.mjs: serverExternalPackages).
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
# No apps/web/public directory exists yet — add
#   COPY --from=builder /repo/apps/web/public ./apps/web/public
# here if one shows up later; standalone builds don't include it automatically.

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
