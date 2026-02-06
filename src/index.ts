export {
  signMessage,
  verifySignature,
  generateKeypair,
  normalizeUrl,
  isTimestampValid,
  DEFAULT_API_URL,
  HEADER_BOT_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
} from "./verify";

export { BotIDClient } from "./client";
export type { BotIDClientOptions, VerificationResult } from "./client";

export { verifyBotID } from "./middleware";
export type { VerifyBotIDOptions } from "./middleware";

export { init } from "./init";
export type { BotIDInitOptions } from "./init";

export { deviceLogin, isLoggedIn, getAccessToken, logout } from "./auth";

export { getCredentials, listAgents, removeCredentials } from "./store";
export type { StoredCredentials, AuthSession } from "./store";

import { init } from "./init";
import { deviceLogin } from "./auth";
export const BotID = { init, login: deviceLogin };
