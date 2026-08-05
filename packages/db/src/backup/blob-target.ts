/**
 * Vercel Blob as a backup destination.
 *
 * `@vercel/blob` is a plain SDK over an HTTPS API — it has nothing to do with
 * Next.js and doesn't require the app to be deployed on Vercel. It runs
 * anywhere Node does, which is what makes it usable from a cron job or systemd
 * unit on your own server.
 *
 * Blobs are uploaded with `access: "private"`, so they're reachable only with
 * the store token. The files are already encrypted, so this is defence in
 * depth rather than the primary protection — but there's no reason to publish
 * database backups on a guessable URL.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { del, get, list, put } from "@vercel/blob";
import type { BackupTarget, PublishResult, StoredBackup } from "./target";

const DEFAULT_PREFIX = "backups/";

export function blobPrefix(): string {
  const raw = process.env.BACKUP_BLOB_PREFIX ?? DEFAULT_PREFIX;
  // A trailing slash makes `list({ prefix })` behave like a folder.
  return raw.endsWith("/") ? raw : `${raw}/`;
}

export function requireBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set.\n" +
        "Get it from the Vercel dashboard: Storage → your Blob store → the .env.local tab,\n" +
        "then put it in the backup environment file alongside BACKUP_PASSPHRASE.",
    );
  }
  return token;
}

export class VercelBlobTarget implements BackupTarget {
  readonly label: string;

  private readonly token: string;
  private readonly prefix: string;

  constructor(token = requireBlobToken(), prefix = blobPrefix()) {
    this.token = token;
    this.prefix = prefix;
    this.label = `Vercel Blob (${prefix})`;
  }

  async publish(localPath: string, name: string, keep: number): Promise<PublishResult> {
    await put(`${this.prefix}${name}`, createReadStream(localPath), {
      access: "private",
      token: this.token,
      contentType: "application/octet-stream",
      // Names already carry a UTC timestamp, so keep them exactly as-is —
      // predictable pathnames make the retention sort trivial.
      addRandomSuffix: false,
      // Never silently replace an existing backup; a name collision means
      // something is wrong and should be loud.
      allowOverwrite: false,
      // Chunked upload, so a large database doesn't depend on one long request.
      multipart: true,
    });

    const all = await this.list();
    const stale = all.slice(keep);

    if (stale.length > 0) {
      await del(
        stale.map((blob) => blob.ref),
        { token: this.token },
      );
    }

    return { retained: all.length - stale.length, dropped: stale.length };
  }

  async list(): Promise<StoredBackup[]> {
    const found: StoredBackup[] = [];
    let cursor: string | undefined;

    // `list` pages; follow the cursor so retention can't be fooled by a
    // partial view of the store.
    do {
      const page = await list({ prefix: this.prefix, token: this.token, cursor, limit: 1000 });

      for (const blob of page.blobs) {
        const name = blob.pathname.slice(this.prefix.length);
        if (!name) continue; // the folder placeholder itself
        found.push({
          name,
          ref: blob.pathname,
          size: blob.size,
          uploadedAt:
            blob.uploadedAt instanceof Date ? blob.uploadedAt.toISOString() : String(blob.uploadedAt),
        });
      }

      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    // Names begin with a UTC timestamp, so a plain reverse sort is newest-first.
    return found.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  }

  async download(ref: string, destPath: string): Promise<void> {
    const result = await get(ref, {
      access: "private",
      token: this.token,
      // Always fetch from origin: a restore must see the true stored bytes,
      // not a cached edge copy.
      useCache: false,
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`Could not download "${ref}" from the blob store.`);
    }

    await pipeline(
      // The SDK types the body as a DOM ReadableStream; Node's `fromWeb` wants
      // its own structurally identical type.
      Readable.fromWeb(result.stream as unknown as NodeWebReadableStream<Uint8Array>),
      createWriteStream(destPath),
    );
  }
}
