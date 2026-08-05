/**
 * Authenticated encryption for database backups — fully streaming.
 *
 * AES-256-GCM with a scrypt-derived key. GCM is *authenticated*: a backup that
 * has been corrupted or tampered with fails to decrypt rather than silently
 * producing garbage, which matters a lot for a file you only ever open on the
 * worst day of the year.
 *
 * File layout (v2):
 *   magic     8 bytes   "VIMARBK2"
 *   salt     32 bytes   scrypt salt, fresh per backup
 *   iv       12 bytes   GCM nonce, fresh per backup
 *   body      n bytes   ciphertext of the gzipped snapshot
 *   tag      16 bytes   GCM authentication tag  <- footer
 *
 * The tag is a *footer* rather than a header field precisely so this can
 * stream: the tag isn't known until the cipher finalizes, so putting it up
 * front would force the whole database into memory. With it at the end, the
 * pipeline is read -> gzip -> encrypt -> write at constant memory regardless of
 * database size.
 *
 * The header is fed in as additional authenticated data, so an attacker can't
 * swap the salt or IV without breaking the tag.
 *
 * v1 files (tag in the header, whole-file buffered) are still readable — see
 * `readLayout`.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
  type ScryptOptions,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, open, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

const MAGIC_V1 = Buffer.from("VIMARBK1", "ascii");
const MAGIC_V2 = Buffer.from("VIMARBK2", "ascii");

const MAGIC_BYTES = 8;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

const HEADER_BYTES = MAGIC_BYTES + SALT_BYTES + IV_BYTES;

/**
 * ~32 MB and ~100 ms per derivation. Deliberately slow: it's the only thing
 * standing between a leaked backup file and the passphrase.
 */
const SCRYPT_PARAMS: ScryptOptions = { N: 32_768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

/**
 * Hand-rolled rather than `promisify(scrypt)`: promisify's types only pick up
 * the 3-argument overload, so the tuning options above would be silently
 * dropped from the signature.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  // Normalise so a passphrase typed with different Unicode composition still
  // derives the same key.
  return scrypt(passphrase.normalize("NFKC"), salt, KEY_BYTES, SCRYPT_PARAMS);
}

export class BackupDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupDecryptError";
  }
}

/**
 * Compress and encrypt `sourcePath` into `destPath`.
 *
 * Streams throughout — memory use is bounded by the pipeline's buffers, not by
 * the size of the database.
 */
export async function encryptFile(
  sourcePath: string,
  destPath: string,
  passphrase: string,
): Promise<void> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt);

  const header = Buffer.concat([MAGIC_V2, salt, iv]);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);

  const out = createWriteStream(destPath, { mode: 0o600 });
  // Queued before the pipeline's first chunk, so it lands at offset 0.
  out.write(header);

  await pipeline(createReadStream(sourcePath), createGzip({ level: 9 }), cipher, out);

  // Valid only after the cipher has finalized, which the pipeline just did.
  await appendFile(destPath, cipher.getAuthTag());
}

interface Layout {
  version: 1 | 2;
  header: Buffer;
  salt: Buffer;
  iv: Buffer;
  tag: Buffer;
  /** Byte range of the ciphertext, inclusive of `bodyEnd`. */
  bodyStart: number;
  bodyEnd: number;
}

/** Read just the framing bytes — never the body. */
async function readLayout(path: string): Promise<Layout> {
  const { size } = await stat(path);
  if (size < HEADER_BYTES + TAG_BYTES) {
    throw new BackupDecryptError("File is too short to be a Vimar backup.");
  }

  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(HEADER_BYTES + TAG_BYTES);
    await handle.read(head, 0, head.length, 0);

    const magic = head.subarray(0, MAGIC_BYTES);
    const salt = head.subarray(MAGIC_BYTES, MAGIC_BYTES + SALT_BYTES);
    const iv = head.subarray(MAGIC_BYTES + SALT_BYTES, HEADER_BYTES);
    const header = head.subarray(0, HEADER_BYTES);

    if (magic.equals(MAGIC_V2)) {
      // Tag lives in the last 16 bytes.
      const tag = Buffer.alloc(TAG_BYTES);
      await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
      return {
        version: 2,
        header,
        salt,
        iv,
        tag,
        bodyStart: HEADER_BYTES,
        bodyEnd: size - TAG_BYTES - 1,
      };
    }

    if (magic.equals(MAGIC_V1)) {
      // Legacy: tag sat immediately after the header.
      return {
        version: 1,
        header,
        salt,
        iv,
        tag: head.subarray(HEADER_BYTES, HEADER_BYTES + TAG_BYTES),
        bodyStart: HEADER_BYTES + TAG_BYTES,
        bodyEnd: size - 1,
      };
    }

    throw new BackupDecryptError("Not a Vimar backup file (bad magic header).");
  } finally {
    await handle.close();
  }
}

/**
 * Decrypt and decompress `sourcePath` into `destPath`.
 *
 * Note on ordering: GCM only authenticates at `final()`, i.e. once the last
 * byte has passed through. Any streaming decryption therefore writes
 * not-yet-authenticated plaintext before the verdict arrives. That is safe here
 * only because callers write to a temporary file and promote it into place
 * *after* this resolves — never decrypt straight onto a live database.
 */
export async function decryptFile(
  sourcePath: string,
  destPath: string,
  passphrase: string,
): Promise<void> {
  const layout = await readLayout(sourcePath);
  const key = await deriveKey(passphrase, layout.salt);

  const decipher = createDecipheriv("aes-256-gcm", key, layout.iv);
  decipher.setAAD(layout.header);
  decipher.setAuthTag(layout.tag);

  try {
    await pipeline(
      createReadStream(sourcePath, { start: layout.bodyStart, end: layout.bodyEnd }),
      decipher,
      createGunzip(),
      createWriteStream(destPath, { mode: 0o600 }),
    );
  } catch {
    // GCM can't distinguish "wrong key" from "corrupted file" — both fail the
    // same way, so say so rather than guessing.
    throw new BackupDecryptError(
      "Could not decrypt. Either the passphrase is wrong or the file is corrupted.",
    );
  }
}

/**
 * Read the passphrase from the environment. Never accept it as a CLI argument:
 * arguments are visible to every process on the machine via `ps`.
 */
export function requirePassphrase(): string {
  const passphrase = process.env.BACKUP_PASSPHRASE;

  if (!passphrase) {
    throw new Error(
      "BACKUP_PASSPHRASE is not set.\n" +
        "Set it in the environment (or the systemd unit's EnvironmentFile) before backing up.\n" +
        "Generate a strong one with:  openssl rand -base64 32",
    );
  }

  if (passphrase.length < 16) {
    throw new Error(
      `BACKUP_PASSPHRASE is only ${passphrase.length} characters. Use at least 16 — ` +
        "these files are going somewhere you don't fully control.",
    );
  }

  return passphrase;
}
