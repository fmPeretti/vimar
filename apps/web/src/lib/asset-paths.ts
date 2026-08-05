/**
 * Blob layout, shared by the browser (which proposes an upload path) and the
 * server (which validates it). Deliberately *not* configurable by environment:
 * if the two sides could disagree about the prefix, every upload would be
 * rejected in a confusing way.
 *
 *   assets/patterns/…    pattern photos    (public)
 *   assets/materials/…   material photos   (public)
 *   backups/…            encrypted backups (private — see packages/db/src/backup)
 */

export const ASSET_ROOT = "assets/";

export type AssetKind = "patterns" | "materials";

export const ASSET_KINDS: AssetKind[] = ["patterns", "materials"];

export function assetPrefix(kind: AssetKind): string {
  return `${ASSET_ROOT}${kind}/`;
}

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

/** Phone photos are routinely 3–8 MB, so leave generous headroom. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Combining marks left behind by NFKD decomposition. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** `Cream Bouclé` -> `cream-boucle` */
export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "item";
}

function extensionFor(fileName: string, contentType: string): string {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(fileName)?.[1]?.toLowerCase();
  if (fromName) return fromName === "jpeg" ? "jpg" : fromName;

  const fromType = contentType.split("/")[1]?.toLowerCase();
  return fromType === "jpeg" ? "jpg" : (fromType ?? "bin");
}

/**
 * Path proposed to the blob store. A random suffix is added server-side at
 * token time, so two photos with the same name never collide.
 */
export function buildAssetPath(kind: AssetKind, label: string, file: File): string {
  return `${assetPrefix(kind)}${slugify(label)}.${extensionFor(file.name, file.type)}`;
}

/**
 * Strict validation of a client-proposed upload path.
 *
 * A prefix check alone is not enough: `assets/materials/../../backups/x` starts
 * with an allowed prefix but escapes it. Since an upload token is scoped to the
 * path it was issued for, a traversal here could mean writing over an encrypted
 * backup — so the shape is validated exactly rather than approximately.
 */
export function isSafeAssetPath(pathname: string): boolean {
  if (!pathname || pathname.length > 300) return false;

  // Percent-encoding could smuggle a traversal past the segment checks below.
  // Legitimate paths from `buildAssetPath` never contain one.
  if (pathname.includes("%")) return false;

  // Backslashes, leading slashes and control characters are all out.
  if (pathname.startsWith("/") || pathname.includes("\\")) return false;
  // Control characters, written as codes so no raw NUL bytes end up in source.
  if ([...pathname].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)) {
    return false;
  }

  // Exactly assets/<kind>/<filename> — no empty, relative or nested segments.
  const segments = pathname.split("/");
  if (segments.length !== 3) return false;
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }

  const [root, kind] = segments;
  return `${root}/` === ASSET_ROOT && ASSET_KINDS.includes(kind as AssetKind);
}
