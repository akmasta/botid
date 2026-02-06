import crypto from "node:crypto";

export const HEADER_BOT_ID = "X-BotID";
export const HEADER_SIGNATURE = "X-BotID-Signature";
export const HEADER_TIMESTAMP = "X-BotID-Timestamp";

export const DEFAULT_API_URL = "https://botid.net";
const TIMESTAMP_WINDOW_SECONDS = 300;

export function normalizeUrl(url?: string): string {
  return (url ?? DEFAULT_API_URL).replace(/\/+$/, "");
}

export function isTimestampValid(timestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - timestamp) <= TIMESTAMP_WINDOW_SECONDS;
}

export function signMessage(message: string, privateKeyHex: string): string {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyHex, "hex"),
    format: "der",
    type: "pkcs8",
  });
  return crypto.sign(null, Buffer.from(message), privateKey).toString("hex");
}

export function verifySignature(
  message: string,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyHex, "hex"),
      format: "der",
      type: "spki",
    });
    return crypto.verify(
      null,
      Buffer.from(message),
      publicKey,
      Buffer.from(signatureHex, "hex"),
    );
  } catch {
    return false;
  }
}

/** Returns hex-encoded SPKI DER (public) and PKCS8 DER (private). */
export function generateKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("hex"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("hex"),
  };
}
