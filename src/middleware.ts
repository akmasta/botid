import {
  HEADER_BOT_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  verifySignature,
  isTimestampValid,
  normalizeUrl,
} from "./verify";
import type { VerificationResult } from "./client";

export interface VerifyBotIDOptions {
  /** BotID registry URL. Defaults to https://botid.net */
  apiUrl?: string;
  /** Block requests without valid BotID headers. @default true */
  requireVerified?: boolean;
  /** Custom handler for failed verification (only when requireVerified is true). */
  onUnverified?: (req: ExpressRequest, res: ExpressResponse) => void;
}

interface ExpressRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  url?: string;
  originalUrl?: string;
  BotID?: VerificationResult;
  [key: string]: unknown;
}

interface ExpressResponse {
  status(code: number): ExpressResponse;
  json(body: unknown): void;
}

type NextFn = () => void;

/**
 * Express middleware that verifies incoming requests against the BotID registry.
 *
 * @example
 * app.use("/api", verifyBotID({ requireVerified: true }));
 */
export function verifyBotID(options: VerifyBotIDOptions = {}) {
  const apiUrl = normalizeUrl(options.apiUrl);
  const requireVerified = options.requireVerified ?? true;

  return async (req: ExpressRequest, res: ExpressResponse, next: NextFn) => {
    const botId = getHeader(req, HEADER_BOT_ID);
    const signature = getHeader(req, HEADER_SIGNATURE);
    const timestampRaw = getHeader(req, HEADER_TIMESTAMP);

    // If no BotID headers present at all, treat as non-bot request
    if (!botId && !signature && !timestampRaw) {
      if (requireVerified) {
        if (options.onUnverified) {
          return options.onUnverified(req, res);
        }
        return res.status(403).json({ error: "BotID verification required" });
      }
      req.BotID = { verified: false, timestamp: Math.floor(Date.now() / 1000) };
      return next();
    }

    // Headers present but incomplete
    if (!botId || !signature || !timestampRaw) {
      if (requireVerified) {
        if (options.onUnverified) {
          return options.onUnverified(req, res);
        }
        return res
          .status(400)
          .json({ error: "Incomplete BotID headers" });
      }
      req.BotID = { verified: false, timestamp: Math.floor(Date.now() / 1000) };
      return next();
    }

    const timestamp = Number(timestampRaw);

    // Reject stale or future timestamps (5-minute window)
    if (!isTimestampValid(timestamp)) {
      req.BotID = { verified: false, timestamp, error: "Timestamp outside valid window" };
      if (requireVerified) {
        if (options.onUnverified) return options.onUnverified(req, res);
        return res.status(403).json({ error: "Timestamp outside valid window" });
      }
      return next();
    }

    try {
      const keysRes = await fetch(`${apiUrl}/api/keys/${botId}`);

      // Handle revoked bots
      if (keysRes.status === 403) {
        const body = (await keysRes.json()) as { revoked?: boolean };
        if (body.revoked) {
          req.BotID = { verified: false, revoked: true, timestamp, error: "Bot identity has been revoked" };
          if (requireVerified) {
            if (options.onUnverified) {
              return options.onUnverified(req, res);
            }
            return res.status(403).json({ error: "Bot identity has been revoked", revoked: true });
          }
          return next();
        }
      }

      if (!keysRes.ok) {
        throw new Error(`Public key lookup failed: ${keysRes.status}`);
      }
      const { publicKey } = (await keysRes.json()) as { publicKey: string };

      const reqPath = (req.originalUrl ?? req.url ?? "/").split("?")[0];
      const reqMethod = (req.method ?? "GET").toUpperCase();
      const message = `${timestamp}.${botId}.${reqMethod}.${reqPath}`;
      const verified = verifySignature(message, signature, publicKey);

      const result: VerificationResult = verified
        ? { verified: true, bot: { id: botId, name: botId, deployer_id: "" }, timestamp }
        : { verified: false, timestamp };

      req.BotID = result;

      if (!verified && requireVerified) {
        if (options.onUnverified) {
          return options.onUnverified(req, res);
        }
        return res
          .status(403)
          .json({ error: "Bot identity verification failed" });
      }

      return next();
    } catch {
      req.BotID = { verified: false, timestamp: Math.floor(Date.now() / 1000), error: "Verification service unavailable" };

      if (requireVerified) {
        if (options.onUnverified) {
          return options.onUnverified(req, res);
        }
        return res
          .status(503)
          .json({ error: "BotID verification service unavailable" });
      }

      return next();
    }
  };
}

function getHeader(req: ExpressRequest, name: string): string | undefined {
  const val = req.headers[name.toLowerCase()];
  if (Array.isArray(val)) return val[0];
  return val;
}
