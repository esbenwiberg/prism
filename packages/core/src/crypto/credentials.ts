/**
 * AES-256-GCM credential encryption for secure PAT storage.
 *
 * Tokens are encrypted with a 32-byte key (provided as 64-char hex string)
 * and stored in the format `iv:ciphertext:tag` (all hex-encoded).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Parse a hex-encoded encryption key into a Buffer.
 *
 * @throws if the key is not a valid 64-character hex string (32 bytes).
 */
function parseKey(hexKey: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
    );
  }
  return Buffer.from(hexKey, "hex");
}

/**
 * Encrypt a plaintext token using AES-256-GCM.
 *
 * @param plaintext - The token to encrypt.
 * @param hexKey - 32-byte encryption key as a 64-character hex string.
 * @returns Encrypted string in the format `iv:ciphertext:tag` (hex-encoded).
 */
export function encryptToken(plaintext: string, hexKey: string): string {
  const key = parseKey(hexKey);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

/**
 * Decrypt an encrypted token produced by {@link encryptToken}.
 *
 * @param encrypted - String in the format `iv:ciphertext:tag` (hex-encoded).
 * @param hexKey - 32-byte encryption key as a 64-character hex string.
 * @returns The original plaintext token.
 * @throws if the key is wrong, the data is tampered, or the format is invalid.
 */
export function decryptToken(encrypted: string, hexKey: string): string {
  const key = parseKey(hexKey);

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted token format — expected iv:ciphertext:tag",
    );
  }

  const [ivHex, ciphertextHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
