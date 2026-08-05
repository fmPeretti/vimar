# Backups

Encrypted snapshots of `data/vimar.db`, uploaded to **Vercel Blob**.

```bash
export BACKUP_PASSPHRASE='…'          # openssl rand -base64 32
export BLOB_READ_WRITE_TOKEN='…'      # Vercel dashboard → Storage → Blob → .env.local

npm run db:backup            # write an encrypted backup to backups/
npm run db:backup:push       # ...and upload it
npm run db:restore -- --list # see what exists, locally and in the store
```

## Does this need Next.js, or hosting on Vercel?

No. `@vercel/blob` is a plain SDK over an HTTPS API — it isn't coupled to
Next.js, and the machine running it doesn't have to be on Vercel. It works from
any Node process: a cron job, a systemd unit, your own server. The only thing
it needs is `BLOB_READ_WRITE_TOKEN`.

## The passphrase is the backup

Everything is encrypted before it leaves the machine with `BACKUP_PASSPHRASE`.
**Lose it and every copy is permanently unreadable** — that's the design, not a
bug. Store it in a password manager or on paper, somewhere that is neither this
server nor the blob store.

The token and the passphrase are separate on purpose: whoever holds the token
can list and download backups, but without the passphrase they get ciphertext.

## What happens on each run

1. **Consistent snapshot.** SQLite's online backup API, never a file copy — the
   database runs in WAL mode, so `cp` while the app is running can produce a
   torn or corrupt file.
2. **Verify.** `PRAGMA integrity_check` plus a schema check, *before*
   encrypting. Encrypting a corrupt database just gets you a corrupt database
   you can no longer inspect.
3. **Compress, then encrypt** — in that order. Ciphertext is indistinguishable
   from noise and won't compress at all. (~144 KB → ~9 KB in practice.)
4. **Encrypt** with AES-256-GCM, key derived by scrypt. GCM is authenticated: a
   tampered or corrupted file fails to decrypt rather than silently yielding
   garbage.
5. **Upload** with `access: "private"`, then delete anything beyond
   `BACKUP_KEEP`.

Every step streams. Memory is bounded by pipeline buffers, not by database
size — a 400 MB database backs up and restores in ~124 MB peak RSS. Uploads use
multipart, so a large database doesn't hinge on one long request.

The GCM tag is stored as a *footer* rather than in the header specifically to
allow this: the tag isn't known until the cipher finalizes, so a header tag
would force the whole database into memory.

One consequence worth understanding: GCM only authenticates once the final byte
has passed through, so streaming decryption necessarily writes
not-yet-authenticated plaintext before the verdict arrives. That's safe here
because restore always decrypts to a temporary file and promotes it into place
only after authentication *and* an integrity check pass. Never decrypt straight
onto a live database.

## Restoring

The default restore is **non-destructive**: it writes to a new file and leaves
the live database alone, so you can open it and confirm before switching.

```bash
# Look at what's available, locally and in the store
npm run db:restore -- --list

# Newest local backup -> data/restored-YYYY-MM-DD.db
npm run db:restore -- --latest

# Newest from the blob store — the disaster-recovery path,
# when this machine's local copies are gone
npm run db:restore -- --remote --latest

# A specific one
npm run db:restore -- --remote vimar-2026-08-05T09-21-32Z.db.gz.enc

# Somewhere specific
npm run db:restore -- --remote --latest --out /tmp/check.db

# Overwrite the live database (moves the current one aside first)
npm run db:restore -- --remote --latest --force
```

Every restore verifies integrity before anything is put in place, so a bad
backup can't destroy a working database. After `--force`, restart the app.

## Recovering onto a fresh machine

```bash
git clone <repo> vimar && cd vimar
npm install
export BACKUP_PASSPHRASE='…'
export BLOB_READ_WRITE_TOKEN='…'
npm run db:restore -- --remote --latest --force
npm run dev
```

## Scheduling

### systemd (recommended)

```bash
sudo install -D -m 0600 deploy/backup.env.example /etc/vimar/backup.env
sudo nano /etc/vimar/backup.env          # passphrase, blob token, paths

sudo install -m 0644 deploy/vimar-backup.service /etc/systemd/system/
sudo install -m 0644 deploy/vimar-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vimar-backup.timer

sudo systemctl start vimar-backup.service          # test it now
journalctl -u vimar-backup.service -n 50           # check it worked
systemctl list-timers vimar-backup.timer           # confirm the schedule
```

Unlike the git target, this needs no SSH keys or git credentials — just the
token in the environment file and outbound HTTPS.

### cron

```cron
20 3 * * *  cd /srv/vimar && set -a && . /etc/vimar/backup.env && set +a && /usr/bin/npm run db:backup:push >> /var/log/vimar-backup.log 2>&1
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `BACKUP_PASSPHRASE` | *(required)* | Encryption passphrase, min 16 chars |
| `DATABASE_PATH` | `<root>/data/vimar.db` | Database to back up |
| `BACKUP_DIR` | `<root>/backups` | Local staging directory |
| `BACKUP_KEEP` | `14` | Backups retained, locally and remotely |
| `BACKUP_TARGET` | `blob` | `blob` or `git` |
| `BLOB_READ_WRITE_TOKEN` | *(required for blob)* | Vercel Blob token |
| `BACKUP_BLOB_PREFIX` | `backups/` | Folder within the store |
| `BACKUP_GIT_REMOTE` | `origin` | git target only |
| `BACKUP_GIT_BRANCH` | `backups` | git target only |

The passphrase is never accepted as a CLI argument — arguments are visible to
every process on the machine via `ps`.

## Swapping destinations

The destination is a small interface (`src/backup/target.ts`): `publish`,
`list`, `download`. The snapshot, verify, compress and encrypt steps don't know
or care where the bytes go, so adding S3, Backblaze B2 or Cloudflare R2 later is
one more implementation and nothing else changes.

`BACKUP_TARGET=git` selects the original git-branch implementation, which is
still present and working. It keeps the branch at a single parentless commit and
force-pushes, because encrypted data never deltas and an accumulating history
would grow forever and never shrink.

## Blob store layout

```
assets/patterns/     pattern photos     private, unencrypted
assets/materials/    material photos    private, unencrypted
backups/             database backups   private, encrypted
```

The store has public access turned off at the account level, so every object
is private regardless of kind — a stored photo URL isn't fetchable without a
short-lived signed URL, minted on render (see "Photos" in README.md).
"Private" here just means the object needs a signature to read; unlike
backups, photos aren't encrypted. The upload token endpoint validates the
exact path shape, so a client token can never be used to write outside
`assets/` — least of all over `backups/`.

## Worth knowing

- **Blobs are uploaded private**, so the token is required to read them. The
  encryption is still the real protection — private access is defence in depth.
- **Rotate the token, not the passphrase**, if the server is ever compromised.
  A new token invalidates access; changing the passphrase would orphan every
  existing backup.
- **Test a restore now and then.** An untested backup is a guess.
  `npm run db:restore -- --remote --latest --out /tmp/check.db` costs seconds.
- **Consider Litestream if you want a smaller recovery window.** This job runs
  daily, so worst case you lose a day. Litestream continuously replicates
  SQLite's WAL to object storage and gets that down to seconds. It complements
  these snapshots rather than replacing them.
