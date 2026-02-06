import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateKeypair,
  signMessage,
  verifySignature,
  normalizeUrl,
  isTimestampValid,
  DEFAULT_API_URL,
  HEADER_BOT_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
} from "../src/verify";

describe("generateKeypair", () => {
  it("returns hex-encoded public and private keys", () => {
    const { publicKey, privateKey } = generateKeypair();
    expect(publicKey).toMatch(/^[0-9a-f]+$/);
    expect(privateKey).toMatch(/^[0-9a-f]+$/);
  });

  it("returns keys of expected lengths", () => {
    const { publicKey, privateKey } = generateKeypair();
    // SPKI DER-encoded Ed25519 public key = 44 bytes = 88 hex chars
    expect(publicKey).toHaveLength(88);
    // PKCS8 DER-encoded Ed25519 private key = 48 bytes = 96 hex chars
    expect(privateKey).toHaveLength(96);
  });

  it("generates unique keypairs each time", () => {
    const a = generateKeypair();
    const b = generateKeypair();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.privateKey).not.toBe(b.privateKey);
  });
});

describe("signMessage / verifySignature", () => {
  it("round-trips: sign then verify", () => {
    const { publicKey, privateKey } = generateKeypair();
    const message = "1700000000.bot_test123.GET./test";
    const signature = signMessage(message, privateKey);

    expect(verifySignature(message, signature, publicKey)).toBe(true);
  });

  it("rejects tampered message", () => {
    const { publicKey, privateKey } = generateKeypair();
    const signature = signMessage("original", privateKey);

    expect(verifySignature("tampered", signature, publicKey)).toBe(false);
  });

  it("rejects wrong public key", () => {
    const keyA = generateKeypair();
    const keyB = generateKeypair();
    const signature = signMessage("test", keyA.privateKey);

    expect(verifySignature("test", signature, keyB.publicKey)).toBe(false);
  });

  it("returns false for malformed signature hex", () => {
    const { publicKey } = generateKeypair();
    expect(verifySignature("test", "not-hex", publicKey)).toBe(false);
  });

  it("returns false for malformed public key hex", () => {
    expect(verifySignature("test", "aabb", "not-a-key")).toBe(false);
  });

  it("signature is hex-encoded", () => {
    const { privateKey } = generateKeypair();
    const signature = signMessage("test", privateKey);
    expect(signature).toMatch(/^[0-9a-f]+$/);
    // Ed25519 signatures are 64 bytes = 128 hex chars
    expect(signature).toHaveLength(128);
  });
});

describe("normalizeUrl", () => {
  it("defaults to DEFAULT_API_URL when undefined", () => {
    expect(normalizeUrl()).toBe(DEFAULT_API_URL);
    expect(normalizeUrl(undefined)).toBe(DEFAULT_API_URL);
  });

  it("strips trailing slashes", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeUrl("https://example.com///")).toBe("https://example.com");
  });

  it("returns url as-is when no trailing slash", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
  });
});

describe("isTimestampValid", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts current timestamp", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isTimestampValid(now)).toBe(true);
  });

  it("accepts timestamp within 5-minute window", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isTimestampValid(now - 299)).toBe(true);
    expect(isTimestampValid(now + 299)).toBe(true);
  });

  it("accepts timestamp at exactly 300 seconds", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isTimestampValid(now - 300)).toBe(true);
    expect(isTimestampValid(now + 300)).toBe(true);
  });

  it("rejects timestamp beyond 5-minute window", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isTimestampValid(now - 301)).toBe(false);
    expect(isTimestampValid(now + 301)).toBe(false);
  });
});

describe("constants", () => {
  it("exports correct header names", () => {
    expect(HEADER_BOT_ID).toBe("X-BotID");
    expect(HEADER_SIGNATURE).toBe("X-BotID-Signature");
    expect(HEADER_TIMESTAMP).toBe("X-BotID-Timestamp");
  });

  it("exports correct default API URL", () => {
    expect(DEFAULT_API_URL).toBe("https://botid.net");
  });
});
