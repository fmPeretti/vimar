import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import {
  ACCEPTED_IMAGE_TYPES,
  ASSET_KINDS,
  assetPrefix,
  isSafeAssetPath,
  MAX_IMAGE_BYTES,
} from "@/lib/asset-paths";

/**
 * Issues short-lived tokens so the browser can upload images straight to Vercel
 * Blob.
 *
 * Going direct matters: the image bytes never pass through this server, which
 * sidesteps Next's server-action body limit (1 MB by default — smaller than most
 * phone photos) and keeps memory flat regardless of file size.
 *
 * The database is *not* updated here. `onUploadCompleted` is a webhook from
 * Vercel's side and can't reach a localhost dev server, so persistence happens
 * in a normal server action once the browser has the URL. That keeps dev and
 * production on the same code path.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,

      onBeforeGenerateToken: async (pathname) => {
        // The client proposes a pathname; never trust it. A prefix check alone
        // would let `assets/materials/../../backups/x` through, so the shape is
        // validated exactly — a token must never be usable to write over an
        // encrypted backup.
        if (!isSafeAssetPath(pathname)) {
          throw new Error(
            `Uploads are only allowed directly under ${ASSET_KINDS.map(assetPrefix).join(" or ")}`,
          );
        }

        return {
          allowedContentTypes: ACCEPTED_IMAGE_TYPES,
          maximumSizeInBytes: MAX_IMAGE_BYTES,
          // Distinct URL per upload, so replacing a photo can never be served
          // stale from cache.
          addRandomSuffix: true,
          // A year: these URLs are immutable thanks to the random suffix.
          cacheControlMaxAge: 60 * 60 * 24 * 365,
          // Forced here, not left to the client: this store has public access
          // turned off, so every write must be private regardless of what the
          // caller asks for. Reads go through a short-lived signed URL instead
          // (see toDisplayUrl).
          access: "private",
        };
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }
}
