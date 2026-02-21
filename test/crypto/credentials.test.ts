import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  encryptToken,
  decryptToken,
} from "../../packages/core/src/crypto/credentials.js";

/** Generate a valid 32-byte hex key for testing. */
function testKey(): string {
  return randomBytes(32).toString("hex");
}

describe("credential encryption", () => {
  describe("encryptToken / decryptToken round-trip", () => {
    it("should encrypt and decrypt a token correctly", () => {
      const key = testKey();
      const plaintext = "ghp_abc123XYZ789";

      const encrypted = encryptToken(plaintext, key);
      const decrypted = decryptToken(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle empty string tokens", () => {
      const key = testKey();
      const plaintext = "";

      const encrypted = encryptToken(plaintext, key);
      const decrypted = decryptToken(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long tokens", () => {
      const key = testKey();
      const plaintext = "a".repeat(1000);

      const encrypted = encryptToken(plaintext, key);
      const decrypted = decryptToken(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle tokens with special characters", () => {
      const key = testKey();
      const plaintext = "p@$$w0rd!#%&*()_+-=[]{}|;':\",./<>?";

      const encrypted = encryptToken(plaintext, key);
      const decrypted = decryptToken(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("encrypted format", () => {
    it("should produce iv:ciphertext:tag format with hex segments", () => {
      const key = testKey();
      const encrypted = encryptToken("test-token", key);

      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);

      const [iv, ciphertext, tag] = parts;

      // IV should be 12 bytes = 24 hex chars
      expect(iv).toMatch(/^[0-9a-f]{24}$/);
      // Ciphertext should be non-empty hex
      expect(ciphertext).toMatch(/^[0-9a-f]+$/);
      // Tag should be 16 bytes = 32 hex chars
      expect(tag).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should produce different ciphertexts for the same plaintext (random IV)", () => {
      const key = testKey();
      const plaintext = "same-token";

      const encrypted1 = encryptToken(plaintext, key);
      const encrypted2 = encryptToken(plaintext, key);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe("decryption failures", () => {
    it("should fail with wrong key", () => {
      const key1 = testKey();
      const key2 = testKey();
      const encrypted = encryptToken("secret", key1);

      expect(() => decryptToken(encrypted, key2)).toThrow();
    });

    it("should fail with tampered ciphertext", () => {
      const key = testKey();
      const encrypted = encryptToken("secret", key);

      const parts = encrypted.split(":");
      // Flip a character in the ciphertext
      const tampered = parts[1].charAt(0) === "a" ? "b" : "a";
      parts[1] = tampered + parts[1].slice(1);
      const tamperedEncrypted = parts.join(":");

      expect(() => decryptToken(tamperedEncrypted, key)).toThrow();
    });

    it("should fail with tampered auth tag", () => {
      const key = testKey();
      const encrypted = encryptToken("secret", key);

      const parts = encrypted.split(":");
      // Flip a character in the tag
      const tampered = parts[2].charAt(0) === "a" ? "b" : "a";
      parts[2] = tampered + parts[2].slice(1);
      const tamperedEncrypted = parts.join(":");

      expect(() => decryptToken(tamperedEncrypted, key)).toThrow();
    });

    it("should fail with invalid format (missing parts)", () => {
      const key = testKey();

      expect(() => decryptToken("not-valid", key)).toThrow(
        "Invalid encrypted token format",
      );
    });
  });

  describe("key validation", () => {
    it("should reject key that is too short", () => {
      expect(() => encryptToken("test", "abcdef")).toThrow(
        "CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string",
      );
    });

    it("should reject key that is too long", () => {
      const longKey = "a".repeat(128);
      expect(() => encryptToken("test", longKey)).toThrow(
        "CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string",
      );
    });

    it("should reject non-hex key", () => {
      const badKey = "g".repeat(64); // 'g' is not hex
      expect(() => encryptToken("test", badKey)).toThrow(
        "CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string",
      );
    });
  });
});
