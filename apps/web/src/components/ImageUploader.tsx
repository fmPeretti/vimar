"use client";

import { upload } from "@vercel/blob/client";
import { Alert, Button, Input } from "@vimar/ui";
import { useRef, useState } from "react";
import {
  ACCEPTED_IMAGE_TYPES,
  buildAssetPath,
  MAX_IMAGE_BYTES,
  type AssetKind,
} from "@/lib/asset-paths";
import { useAssetDisplayUrl } from "@/lib/use-asset-url";

/** Vercel Blob retries a failed request with backoff for several minutes by
 * default — fine for a flaky network, bad for a misconfigured store, where it
 * just looks hung. Fail fast instead. */
const UPLOAD_TIMEOUT_MS = 30_000;

/**
 * Photo picker that uploads straight from the browser to Vercel Blob.
 *
 * The file never passes through the Next server: `upload()` asks
 * `/api/blob/upload` for a short-lived token, then sends the bytes directly.
 * That avoids the server-action body limit (1 MB by default, smaller than most
 * phone photos) and keeps server memory flat.
 *
 * The store has public access turned off, so every upload is private and the
 * stored URL isn't fetchable on its own — `value` (what gets persisted) and
 * the preview actually shown are different things. `onChange` reports the raw
 * URL; persisting it is the parent's job, so this works identically for a
 * record being created and one being edited.
 */
export function ImageUploader({
  kind,
  label,
  value,
  onChange,
  disabled,
}: {
  kind: AssetKind;
  /** Used to name the file, e.g. the pattern or material name. */
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlField, setShowUrlField] = useState(false);
  const previewUrl = useAssetDisplayUrl(value);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("That file isn't an image. Use a JPG, PNG, WebP, GIF or AVIF.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(
        `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
      );
      return;
    }

    setBusy(true);
    try {
      const blob = await upload(buildAssetPath(kind, label || kind, file), file, {
        // The store forces private regardless (see /api/blob/upload); this is
        // just satisfying the client's required option, not what decides it.
        access: "private",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type,
        abortSignal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      onChange(blob.url);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === "TimeoutError"
          ? "Upload timed out — check the Blob store is reachable and configured correctly."
          : cause instanceof Error
            ? cause.message
            : "Upload failed.",
      );
    } finally {
      setBusy(false);
      // Allow re-picking the same file after an error.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="vm-uploader">
      <div className="vm-uploader__row">
        <div className="vm-uploader__preview" aria-hidden={!value}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary blob/user URLs
            <img src={previewUrl} alt="" />
          ) : (
            <span className="vm-uploader__empty">{value ? "loading…" : "no photo"}</span>
          )}
        </div>

        <div className="vm-uploader__controls">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="vm-sr-only"
            disabled={disabled || busy}
            onChange={(event) => void pick(event.target.files?.[0])}
          />

          <div className="vm-row">
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Uploading…" : value ? "Replace photo" : "Upload photo"}
            </Button>

            {value ? (
              <Button
                variant="danger"
                size="sm"
                disabled={disabled || busy}
                onClick={() => onChange(null)}
              >
                Remove
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              onClick={() => setShowUrlField(!showUrlField)}
            >
              {showUrlField ? "Hide URL" : "Use a link"}
            </Button>
          </div>

          {showUrlField ? (
            <Input
              value={value ?? ""}
              placeholder="https://…"
              onChange={(event) => onChange(event.target.value.trim() || null)}
            />
          ) : null}

          <span className="vm-tiny vm-muted">
            JPG, PNG, WebP, GIF or AVIF · up to {MAX_IMAGE_BYTES / 1024 / 1024} MB
          </span>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
