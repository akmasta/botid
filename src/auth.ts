import { saveAuthSession, getAuthSession, clearAuthSession } from "./store";
import { normalizeUrl } from "./verify";

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export interface PollResponse {
  status: "pending" | "complete" | "expired" | "consumed" | "error";
  accessToken?: string;
  error?: string;
}

export async function requestDeviceCode(apiUrl?: string): Promise<DeviceCodeResponse> {
  const base = normalizeUrl(apiUrl);
  const res = await fetch(`${base}/api/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to request device code (${res.status})`);
  }

  return res.json() as Promise<DeviceCodeResponse>;
}

export async function pollDeviceAuth(
  deviceCode: string,
  apiUrl?: string,
): Promise<PollResponse> {
  const base = normalizeUrl(apiUrl);
  const res = await fetch(`${base}/api/device/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceCode }),
  });

  if (!res.ok && res.status !== 202) {
    throw new Error(`Device poll failed (${res.status})`);
  }

  return res.json() as Promise<PollResponse>;
}

/**
 * Run the full device authorization flow. Opens the browser for GitHub
 * sign-in, polls until complete, and stores the session in ~/.botid/.
 */
export async function deviceLogin(options: {
  apiUrl?: string;
  onPrompt: (verificationUrl: string, userCode: string) => void;
  onOpen?: () => void;
}): Promise<string> {
  const apiUrl = normalizeUrl(options.apiUrl);
  const codeResponse = await requestDeviceCode(apiUrl);

  options.onPrompt(codeResponse.verificationUrl, codeResponse.userCode);

  try {
    const { execFile } = await import("node:child_process");
    const url = `${codeResponse.verificationUrl}?user_code=${encodeURIComponent(codeResponse.userCode)}`;
    const platform = process.platform;

    if (platform === "darwin") {
      execFile("open", [url]);
    } else if (platform === "win32") {
      execFile("cmd", ["/c", "start", "", url]);
    } else {
      execFile("xdg-open", [url]);
    }

    options.onOpen?.();
  } catch {
    // Browser open failed — user will navigate manually
  }

  const startTime = Date.now();
  const timeoutMs = codeResponse.expiresIn * 1000;
  const intervalMs = codeResponse.interval * 1000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const poll = await pollDeviceAuth(codeResponse.deviceCode, apiUrl);

    if (poll.status === "complete" && poll.accessToken) {
      saveAuthSession({
        accessToken: poll.accessToken,
        apiUrl,
        authenticatedAt: new Date().toISOString(),
      });
      return poll.accessToken;
    }

    if (poll.status === "expired") {
      throw new Error("Device code expired. Please try again.");
    }

    if (poll.status === "consumed") {
      throw new Error("Device code already used. Please try again.");
    }

    if (poll.status === "error") {
      throw new Error(poll.error ?? "Authentication failed");
    }
  }

  throw new Error("Authentication timed out. Please try again.");
}

export function isLoggedIn(apiUrl?: string): boolean {
  const session = getAuthSession();
  if (!session) return false;
  if (apiUrl && session.apiUrl !== apiUrl) return false;
  return true;
}

export function getAccessToken(apiUrl?: string): string | undefined {
  const session = getAuthSession();
  if (!session) return undefined;
  if (apiUrl && session.apiUrl !== apiUrl) return undefined;
  return session.accessToken;
}

export function logout(): boolean {
  return clearAuthSession();
}
