import { BotIDClient } from "./client";
import { generateKeypair, normalizeUrl } from "./verify";
import { getCredentials, saveCredentials, getAuthSession } from "./store";

export interface BotIDInitOptions {
  /** Human-readable name for this agent (also used as the storage key). */
  name: string;
  /**
   * Access token for authenticated registration.
   * Falls back to the stored session from `botid login`
   * or the BOTID_TOKEN environment variable.
   */
  accessToken?: string;
  /** BotID registry URL. Defaults to https://botid.net */
  apiUrl?: string;
}

interface RegistrationResponse {
  botId: string;
  deployer: string;
  success: boolean;
  error?: string;
}

/**
 * Register (or load) a BotID agent. On first run, registers with the registry
 * and stores keys in `~/.botid/`. On subsequent runs, loads existing credentials.
 *
 * @example
 * const agent = await BotID.init({ name: "my-research-agent" });
 * await agent.fetch("https://api.example.com/data");
 */
export async function init(options: BotIDInitOptions): Promise<BotIDClient> {
  const apiUrl = normalizeUrl(options.apiUrl);

  // Check for existing credentials
  const existing = getCredentials(options.name);
  if (existing) {
    return new BotIDClient({
      botId: existing.botId,
      privateKey: existing.privateKey,
      apiUrl: existing.apiUrl,
    });
  }

  // Resolve access token: explicit > env var > stored session
  const accessToken =
    options.accessToken
    ?? process.env.BOTID_TOKEN
    ?? getAuthSession()?.accessToken;

  if (!accessToken) {
    throw new Error(
      "Authentication required. Run `botid login` first, or set the BOTID_TOKEN environment variable.",
    );
  }

  // Generate keypair client-side (private key never leaves this machine)
  const { publicKey, privateKey } = generateKeypair();

  // Register with the BotID registry (authenticated)
  const res = await fetch(`${apiUrl}/api/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name: options.name,
      publicKey,
    }),
  });

  if (!res.ok) {
    throw new Error(`BotID registration failed (HTTP ${res.status})`);
  }

  const data = (await res.json()) as RegistrationResponse;

  if (!data.success || !data.botId) {
    throw new Error(`BotID registration failed: ${data.error ?? "Unknown error"}`);
  }

  // Store credentials locally
  saveCredentials({
    botId: data.botId,
    privateKey,
    name: options.name,
    deployer: data.deployer,
    apiUrl,
    createdAt: new Date().toISOString(),
  });

  return new BotIDClient({
    botId: data.botId,
    privateKey,
    apiUrl,
  });
}
