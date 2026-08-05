# Deploying

The app runs as one Docker container (`vimar-web`) behind the shared `edge`
nginx reverse proxy. Backups run separately, directly on the host — see
[BACKUPS.md](BACKUPS.md) — against the same data directory the container
uses, so nothing needs to run inside the container for that to work.

## Layout on the VPS

```
/opt/vimar/            git clone of this repo — used to run db:push,
                        db:seed and the backup/restore CLIs on the host
/opt/vimar/data/        vimar.db + WAL/shm — bind-mounted into the container
```

The container and the host-run backup timer both read/write
`/opt/vimar/data/vimar.db`. SQLite's WAL mode is what makes that safe —
concurrent readers/writers across processes are exactly what it's for.

## First deploy

```bash
git clone <repo> /opt/vimar && cd /opt/vimar

# 1. Schema + seed, run from the host against the real data directory
mkdir -p /opt/vimar/data
DATABASE_PATH=/opt/vimar/data/vimar.db npm install
DATABASE_PATH=/opt/vimar/data/vimar.db npm run db:push

# 2. Container config
install -D -m 0600 deploy/vimar.env.example deploy/vimar.env
nano deploy/vimar.env          # BLOB_READ_WRITE_TOKEN, AUTH_USERNAME/PASSWORD

# 3. Build and start
docker network create edge     # only if the edge stack hasn't already made it
docker compose up -d --build

# 4. Vhost — the edge stack mounts this directory read-only
#    (adjust the path to wherever that stack expects vhosts to live)
cp deploy/vhost/vimar /path/to/edge/vhosts/vimar
# then reload nginx from the edge stack

# 5. Backups — see BACKUPS.md for the systemd timer
```

## Redeploying

```bash
cd /opt/vimar && git pull
docker compose up -d --build
```

If the schema changed, run `db:push` from the host first (step 1 above)
before restarting the container — the container itself never runs migrations.

## Why the data directory is a bind mount, not a named volume

The backup timer (`deploy/vimar-backup.service`) runs on the host, not in a
container, and opens `/opt/vimar/data/vimar.db` directly with the same
`packages/db` code the app uses. A bind mount makes that trivial — a named
Docker volume would mean either running backups inside the container too, or
reaching into Docker's volume storage to get at the file, for no benefit here.

## Login lockout after a redeploy

`docker compose up -d --build` replaces the container, which resets the
in-process part of the login lockout the same way a plain restart does (see
"Site login" in the root README). If you need to clear a lock without a
redeploy, run the `UPDATE auth_lockout ...` statement from the README
directly against `/opt/vimar/data/vimar.db`.
