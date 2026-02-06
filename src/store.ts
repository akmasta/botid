import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BOTID_DIR = path.join(os.homedir(), ".botid");
const CREDENTIALS_FILE = path.join(BOTID_DIR, "credentials.json");
const AUTH_FILE = path.join(BOTID_DIR, "auth.json");

export interface StoredCredentials {
  botId: string;
  privateKey: string;
  name: string;
  deployer: string;
  apiUrl: string;
  createdAt: string;
}

export interface CredentialsStore {
  agents: Record<string, StoredCredentials>;
}

export interface AuthSession {
  accessToken: string;
  apiUrl: string;
  authenticatedAt: string;
}

function ensureDir(): void {
  if (!fs.existsSync(BOTID_DIR)) {
    fs.mkdirSync(BOTID_DIR, { mode: 0o700 });
  }
}

function readStore(): CredentialsStore {
  ensureDir();
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    return { agents: {} };
  }
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(raw) as CredentialsStore;
  } catch {
    return { agents: {} };
  }
}

function writeStore(store: CredentialsStore): void {
  ensureDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

export function getCredentials(name: string): StoredCredentials | undefined {
  return readStore().agents[name];
}

export function saveCredentials(creds: StoredCredentials): void {
  const store = readStore();
  store.agents[creds.name] = creds;
  writeStore(store);
}

export function listAgents(): string[] {
  return Object.keys(readStore().agents);
}

export function removeCredentials(name: string): boolean {
  const store = readStore();
  if (!(name in store.agents)) return false;
  delete store.agents[name];
  writeStore(store);
  return true;
}

export function saveAuthSession(session: AuthSession): void {
  ensureDir();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(session, null, 2), {
    mode: 0o600,
  });
}

export function getAuthSession(): AuthSession | undefined {
  ensureDir();
  if (!fs.existsSync(AUTH_FILE)) return undefined;
  try {
    const raw = fs.readFileSync(AUTH_FILE, "utf-8");
    return JSON.parse(raw) as AuthSession;
  } catch {
    return undefined;
  }
}

export function clearAuthSession(): boolean {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
    return true;
  }
  return false;
}
