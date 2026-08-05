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

# 4. Vhost + TLS — see the "First-time nginx + certbot" section below.
#    Skip straight to it before step 5; the site needs to be reachable on
#    :80 before certbot can issue a certificate.

# 5. Backups — see BACKUPS.md for the systemd timer
```

## First-time nginx + certbot setup

The shared `edge` stack (`/opt/edge`) mounts one host directory per project
into its nginx container, e.g. `/opt/donna/nginx/vhosts:/etc/nginx/vhosts/donna:ro`,
and its `nginx.conf` picks up everything under
`/etc/nginx/vhosts/*/*.conf` — note the `.conf`, files without it are
silently ignored. certbot runs on the **host**, not in a container; it drops
challenge files in `/var/www/certbot` and certs in `/etc/letsencrypt`, both of
which the nginx container already mounts read-only.

`deploy/vhost/vimar.conf` (the real vhost) has a `listen 443 ssl` block
pointing at a certificate that doesn't exist yet on a fresh box. Loading it
before the cert exists makes nginx refuse to (re)load, which means the `:80`
challenge route never comes up either — so the first pass uses
`deploy/vhost/vimar-bootstrap.conf` (HTTP-only) instead:

```bash
# 1. Ops directory nginx will actually read from — start with the bootstrap
#    (HTTP-only) version, since no cert exists yet.
mkdir -p /opt/vimar/nginx/vhosts
cp /opt/vimar/deploy/vhost/vimar-bootstrap.conf /opt/vimar/nginx/vhosts/vimar.conf

# 2. Add vimar to the edge stack, same pattern as donna/satriales
cd /opt/edge
nano docker-compose.yml
#   add under nginx: volumes:
#     - /opt/vimar/nginx/vhosts:/etc/nginx/vhosts/vimar:ro

# 3. New volume mount -> the container needs recreating, not just a reload.
#    This briefly restarts nginx for every project behind edge, donna and
#    satriales included — a few seconds of downtime, not a config change to
#    either of those. Fine off-hours, worth a heads-up otherwise.
docker compose up -d

# 4. Confirm the challenge route is actually reachable before asking
#    Let's Encrypt to hit it — DNS for vimar.amiiboexplorer.com must already
#    point at this VPS.
curl -I http://vimar.amiiboexplorer.com/.well-known/acme-challenge/x
# expect 404 from nginx (means it's routing here), not a timeout/refused

# 5. Issue the certificate
certbot certonly --webroot -w /var/www/certbot -d vimar.amiiboexplorer.com

# 6. Swap in the real vhost now that the cert exists, and reload — no
#    container recreate needed this time, the volume is already mounted.
cp /opt/vimar/deploy/vhost/vimar.conf /opt/vimar/nginx/vhosts/vimar.conf
docker compose ps                       # get the nginx container's name
docker exec <that-container-name> nginx -s reload

# 7. Verify
curl -I https://vimar.amiiboexplorer.com
```

certbot's systemd timer (installed with the `certbot` package) handles
renewal automatically — nginx picks up the renewed cert on its own 12-hourly
reload loop (see the `command:` block in edge's `docker-compose.yml`), no
action needed here.

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
