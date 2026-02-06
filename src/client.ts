import { signMessage, normalizeUrl, HEADER_BOT_ID, HEADER_SIGNATURE, HEADER_TIMESTAMP } from "./verify";

export interface BotIDClientOptions {
  botId: string;
  privateKey: string;
  apiUrl?: string;
}

export interface VerificationResult {
  verified: boolean;
  bot?: {
    id: string;
    name: string;
    deployer_id: string;
  };
  timestamp: number;
  error?: string;
  /** True if the bot's identity has been explicitly revoked by its deployer */
  revoked?: boolean;
}

/**
 * Wraps `fetch` so every outgoing request is signed with BotID identity headers.
 *
 * @example
 * const client = new BotIDClient({ botId: "bot_abc123", privateKey: "<hex>" });
 * const res = await client.fetch("https://example.com/api/data");
 */
export class BotIDClient {
  readonly botId: string;
  private readonly privateKey: string;
  private readonly apiUrl: string;

  constructor(options: BotIDClientOptions) {
    this.botId = options.botId;
    this.privateKey = options.privateKey;
    this.apiUrl = normalizeUrl(options.apiUrl);
  }

  /** Drop-in `fetch` replacement that signs every request with BotID headers. */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const timestamp = Math.floor(Date.now() / 1000);
    const method = (init?.method ?? "GET").toUpperCase();
    const pathname = new URL(url).pathname;
    const message = `${timestamp}.${this.botId}.${method}.${pathname}`;
    const signature = signMessage(message, this.privateKey);

    const headers = new Headers(init?.headers);
    headers.set(HEADER_BOT_ID, this.botId);
    headers.set(HEADER_SIGNATURE, signature);
    headers.set(HEADER_TIMESTAMP, String(timestamp));

    return fetch(url, { ...init, headers });
  }

  /** Verify this bot's identity against the BotID API (health check). */
  async verify(): Promise<VerificationResult> {
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${timestamp}.${this.botId}.POST./api/verify`;
    const signature = signMessage(message, this.privateKey);

    const res = await fetch(`${this.apiUrl}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botId: this.botId,
        signature,
        timestamp,
        method: "POST",
        path: "/api/verify",
      }),
    });

    return res.json() as Promise<VerificationResult>;
  }
}
