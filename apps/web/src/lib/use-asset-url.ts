"use client";

import { useEffect, useState } from "react";
import { getAssetDisplayUrlAction } from "@/lib/actions/asset-actions";

/**
 * Resolves a stored (private) asset URL into a short-lived signed URL a
 * browser can actually load. Re-resolves whenever `url` changes, so it works
 * both for a photo already on the record and one just uploaded.
 */
export function useAssetDisplayUrl(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setResolved(null);
      return;
    }
    getAssetDisplayUrlAction(url).then((signed) => {
      if (!cancelled) setResolved(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}
