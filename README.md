# Vimar

Internal tool for Vimar Stitches: track materials and what they cost, define
patterns, record what each finished plushie actually consumed, and plan the
work on a calendar.

Styled from the **Vimar Stitches Design System** (Claude Design project
`c201133b`) — tokens, components and the sectioned ops layout are ported
directly.

## Quick start

```bash
npm install
npm run db:push     # create the SQLite schema
npm run db:seed     # sample materials, patterns, crafts and events
npm run dev         # http://localhost:3000
```

`npm run setup` does the first three in one go. `npm run db:reseed` wipes and
reseeds.

The database is a single file at `data/vimar.db` (override with
`DATABASE_PATH`). It is gitignored.

## The idea

**Material cost is not one number.** Yarn costs what it cost *that day*, so
every purchase is stored as its own lot with its own price. Crafting draws
material from the **oldest lot first (FIFO)**, so a finished plushie carries the
price you actually paid for the yarn in it — not today's price.

That's why the same pattern legitimately costs different amounts on different
days. In the seed data, Luma comes out at **$10.71** on one batch and **$14.81**
on the next: a pricier yarn lot, plus an extra half-skein burned on a mistake.

**Mistakes are first-class.** When completing a pattern you edit what you
*actually* used — more of something, or a material the recipe never mentioned.
That's recorded against that craft session only. The pattern's standard recipe
stays clean, and those specific units cost what they really cost.

## Screens

| Screen | What it's for |
| --- | --- |
| **Dashboard** | Money in materials, money in finished stock, what it's worth at sale price, low stock, planned crafts you can't make yet |
| **Calendar** | Month view + focus view per event, with checklists and a materials readiness check |
| **Materials** | Every material, its purchase lots, current vs. lifetime average cost, stock status |
| **Finished inventory** | Units on hand per pattern, cost basis per craft session, margin, sold/gifted, undo |
| **Patterns** | Bill of materials, tags, time, sale price, live standard cost and margin |
| **Complete a pattern** | The craft flow — edit actual usage, see shortfalls, add to stock |

### Cost figures, and what each one means

- **Stock cost** — weighted average of what's *still on the shelf*. Used to
  value current inventory.
- **Usually costs** — weighted average across *every purchase ever made*. This
  is the "what does this material generally run me" number.
- **Last** — the most recent purchase price.
- A craft's **unit cost** is none of these: it's the actual FIFO lots consumed.

### Calendar

Events have a kind (build a pattern, tutorial, social post, restock, admin) and
an editable checklist, seeded from a per-kind template. Craft events can name a
pattern and quantity — the app then checks current stock against the recipe and
flags a craft you can't complete yet, on the calendar chip, the event page and
the dashboard.

Readiness deliberately checks against *current* stock only; it does not reserve
material across several planned events, since a plan isn't a commitment and
double-counting reservations produces more false alarms than it prevents.

## Environment

One file, `apps/web/.env.local` (gitignored):

```bash
cp apps/web/.env.example apps/web/.env.local
```

Next.js loads it for the web app. The command-line tools read it too — they look
at `.env`, `.env.local` and `apps/web/.env.local` at the repo root — so in
development that single file covers everything. Variables already set in the
environment always win, which is how systemd supplies them in production
(see [deploy/BACKUPS.md](deploy/BACKUPS.md)).

## Architecture

**There is no separate backend service.** The Next.js server *is* the backend,
and it talks to a SQLite file in its own process.

```
browser
   │  HTML + a little client JS
   ▼
Next.js server (apps/web)  ──────────────┐
   server components   read via repos    │  one Node process
   server actions      write via repos   │
   /api/blob/upload    issues tokens     │
   │                                     │
   ▼                                     │
packages/db  repositories ───────────────┘
   │  better-sqlite3, in-process — no network hop, no DB server
   ▼
data/vimar.db
```

- **Reading**: a page like `/materials` is a *server component*. It calls
  `getMaterialViews()` on the server, which goes straight to SQLite, and ships
  finished HTML. No `fetch`, no REST endpoint, no loading spinner.
- **Writing**: forms call *server actions* (`createMaterialAction`, …) — plain
  async functions marked `"use server"`. React posts to them for you. Again, no
  hand-written API layer.
- **The only real HTTP endpoint** is `/api/blob/upload`, and it exists purely
  because the *browser* needs an upload token — it isn't part of the data flow.

So: it's a Next.js app, but the business logic deliberately isn't Next-shaped.

- `packages/core` is plain TypeScript — no React, no Next, no database. FIFO
  costing and planner rules are pure functions of their arguments.
- `packages/db` implements the repository interfaces `core` defines.
- `apps/web` is only screens plus a thin action layer.

The proof that the backend isn't tied to Next: `npm run db:backup` is an
ordinary Node script that imports `packages/db` directly and never loads Next at
all. The same repositories serve the web app, the seed script and the backup
tool.

**Deploying** is therefore one process (`next start`) plus a systemd timer for
backups. No API server, no database server, no container orchestration.

## Layout

```
apps/web            Next.js 15 App Router — screens, server actions, upload route
  src/app/          one folder per screen; page.tsx runs on the server
  src/lib/          repos, queries (read) and actions (write)
packages/core       Domain types, FIFO costing, planner logic, repository interfaces
packages/db         Drizzle schema, SQLite repositories, seed, backup CLI
packages/ui         Design-system tokens and components
deploy/             systemd units and backup docs
```

### Repository pattern

`packages/core/src/repositories.ts` defines the storage contract
(`MaterialRepository`, `PatternRepository`, `TagRepository`, `CraftRepository`,
`EventRepository`). `packages/db` is the only implementation. The app talks to
storage exclusively through `apps/web/src/lib/repos.ts`.

Swapping SQLite for Postgres means writing a new set of implementations and
pointing that one file at them. No screen, action, or costing rule changes.

Costing logic lives in `packages/core` as **pure functions** — no I/O, no
framework. `planCraft` returns a *plan* (which lots to draw from), and the
repository applies it inside a transaction, re-checking each lot at write time
so two concurrent crafts can't spend the same skein.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (also typechecks) |
| `npm run db:push` | Apply schema changes |
| `npm run db:seed` | Seed (skips if data exists) |
| `npm run db:reseed` | Wipe and reseed |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:backup` | Encrypted snapshot into `backups/` |
| `npm run db:backup:push` | ...and publish to the backup branch |
| `npm run db:restore -- --list` | Show available backups |

## Backups

Encrypted (AES-256-GCM, scrypt), verified, fully streaming snapshots uploaded to
**Vercel Blob** as private objects. See **[deploy/BACKUPS.md](deploy/BACKUPS.md)**
for the full story — systemd timer, restore paths, and recovery onto a fresh
machine.

```bash
export BACKUP_PASSPHRASE='…'        # openssl rand -base64 32
export BLOB_READ_WRITE_TOKEN='…'    # Vercel → Storage → Blob → .env.local

npm run db:backup:push
npm run db:restore -- --remote --latest --force
```

`@vercel/blob` is a plain HTTPS SDK — this does not require Next.js or hosting
on Vercel, and runs fine from a cron job on your own server.

The passphrase *is* the backup: lose it and every copy is unreadable. Store it
somewhere that is neither the server nor the blob store.

## Site login

Off by default (`AUTH_USERNAME`/`AUTH_PASSWORD` unset). Set both — plus
`AUTH_SESSION_SECRET` — and every page requires signing in at `/login`, a
real page styled like the rest of the app, not the browser's native Basic
Auth prompt. A successful login sets a signed, `httpOnly` session cookie
(30-day expiry); "Sign out" in the sidebar clears it.

[middleware.ts](apps/web/src/middleware.ts) is what actually gates every
request — it runs on the Node.js (not Edge) runtime so it can reach SQLite
directly for the lockout check. It only checks whether the request already
has a valid session cookie; the credential check itself lives in
`lib/actions/auth-actions.ts`, called from the `/login` form.

Three wrong passwords in a row locks the site — even a correct password
afterwards is rejected — until either:

- the server process restarts (the lock resets once, automatically, the
  moment the middleware module loads), or
- you clear it by hand against the live database:
  ```sql
  UPDATE auth_lockout SET failed_attempts = 0, locked = 0 WHERE id = 1;
  ```

`AUTH_SESSION_SECRET` signs the session cookie and is deliberately separate
from `AUTH_PASSWORD` — reusing the password would mean a short one also
weakens every issued cookie, and changing the password would silently log
everyone out. Generate it the same way: `openssl rand -base64 32`.

This is meant for one household behind a reverse proxy, not multi-user
auth — there's one username/password pair, not a user table.

## Photos

Materials and patterns can each carry a photo, uploaded straight from the
browser to Vercel Blob:

```
assets/patterns/     pattern photos     private, unencrypted
assets/materials/    material photos    private, unencrypted
backups/             database backups   private, encrypted
```

The bytes never pass through the Next server — `/api/blob/upload` issues a
short-lived, path-scoped token and the browser uploads directly. That sidesteps
the 1 MB server-action body limit (smaller than most phone photos) and keeps
server memory flat. Replaced and deleted photos are cleaned out of the store
automatically; pasted third-party URLs are left alone.

The store has public access turned off, so a stored photo URL isn't fetchable
on its own — every `<img>` resolves it to a short-lived signed URL first
(`getAssetDisplayUrlAction` → `toDisplayUrl` in `apps/web/src/lib/blob.ts`,
15-minute expiry, re-signed on every render). "Private" here just means the
object needs a signature to read; it's not encrypted the way backups are.

Set `BLOB_READ_WRITE_TOKEN` in `apps/web/.env.local` for local development.

## Notes

- **Deployment**: SQLite needs a persistent disk — fine locally, on a VPS or in
  Docker; it will *not* work on Vercel serverless. Move to Postgres for that.
  A `Dockerfile` and `docker-compose.yml` are at the repo root (Next.js
  standalone output, better-sqlite3's native binary included via file
  tracing) — see [deploy/DEPLOY.md](deploy/DEPLOY.md) for the container +
  nginx vhost + host-run-backups setup this project actually uses.
- **Pattern photos** are URLs; the design system's imagery wasn't copied in, so
  patterns without a photo show a yarn-swatch placeholder.
- **Fonts** are Google Fonts stand-ins (Baloo 2 / Quicksand / Caveat) as flagged
  in the design system — swap in the real files when available.
- **Money** is stored in cents. Unit costs may be fractional cents, so stuffing
  at $0.185/oz doesn't silently round to $0.19.
