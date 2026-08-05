"use server";

import { toDisplayUrl } from "@/lib/blob";

/**
 * Every stored photo URL is private and unfetchable on its own — the browser
 * needs a short-lived signed URL to actually load it. Called from the client
 * whenever an image is about to be shown: right after upload, and whenever an
 * existing material/pattern photo is rendered.
 */
export async function getAssetDisplayUrlAction(url: string | null): Promise<string | null> {
  return toDisplayUrl(url);
}
