import "server-only";

import { del, issueSignedToken, presignUrl } from "@vercel/blob";
import { ASSET_ROOT } from "@/lib/asset-paths";

/**
 * Server-side blob housekeeping.
 *
 * This store has public access turned off at the account level, so every
 * asset — material and pattern photos included — is uploaded and stored
 * **private**. A stored blob URL is not fetchable on its own; the browser
 * always needs a short-lived signed URL, minted on demand by
 * `toDisplayUrl`/`getAssetDisplayUrlAction`. Backups were always private and
 * encrypted on top of that; images are private but not encrypted.
 */

/** True only for URLs in our own store, under our own asset prefix. */
export function isOwnedAsset(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname, pathname } = new URL(url);
    if (!hostname.endsWith(".vercel-storage.com")) return false;
    return pathname.replace(/^\//, "").startsWith(ASSET_ROOT);
  } catch {
    return false;
  }
}

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/**
 * Turns a stored (private, unfetchable) asset URL into a short-lived signed
 * URL a browser can load directly. Anything that isn't one of our own blobs —
 * `null`, or a third-party URL someone pasted in — passes through unchanged,
 * since those need no signing and aren't ours to sign.
 */
export async function toDisplayUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (!isOwnedAsset(url)) return url;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;

  const pathname = new URL(url).pathname.replace(/^\//, "");
  const validUntil = Date.now() + SIGNED_URL_TTL_MS;

  const signed = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
    token,
  });
  const { presignedUrl } = await presignUrl(signed, {
    operation: "get",
    pathname,
    access: "private",
  });
  return presignedUrl;
}

/**
 * Delete a previously uploaded image, best-effort.
 *
 * Deliberately never throws: an orphaned blob is a rounding error, but failing
 * a save because cleanup hiccuped would be a real bug. Pasted third-party URLs
 * are skipped — they aren't ours to delete.
 */
export async function deleteAssetIfOwned(url: string | null | undefined): Promise<void> {
  if (!isOwnedAsset(url)) return;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;

  try {
    await del(url as string, { token });
  } catch (error) {
    console.warn(`Could not delete image ${url}:`, error);
  }
}

/** Drop the old image once it has actually been replaced by a different one. */
export async function replaceAsset(
  previous: string | null | undefined,
  next: string | null | undefined,
): Promise<void> {
  if (previous && previous !== next) await deleteAssetIfOwned(previous);
}
