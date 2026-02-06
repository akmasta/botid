import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StoredCredentials, AuthSession } from "../src/store";

// Mock node:fs before importing store
const mockFs = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
};
vi.mock("node:fs", () => ({ default: mockFs }));

// Mock node:os to control homedir
vi.mock("node:os", () => ({
  default: { homedir: () => "/mock-home" },
}));

// Import after mocks are set up
const store = await import("../src/store");

const CREDENTIALS_PATH = "/mock-home/.botid/credentials.json";
const AUTH_PATH = "/mock-home/.botid/auth.json";

const testCreds: StoredCredentials = {
  botId: "bot_test123",
  privateKey: "aabbccdd",
  name: "test-agent",
  deployer: "testuser@github",
  apiUrl: "https://botid.net",
  createdAt: "2025-01-01T00:00:00.000Z",
};

const testSession: AuthSession = {
  accessToken: "token_abc",
  apiUrl: "https://botid.net",
  authenticatedAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: directory exists
  mockFs.existsSync.mockReturnValue(false);
});

describe("saveCredentials / getCredentials", () => {
  it("saves and reads back credentials", () => {
    // First call: dir check (false → create), second: credentials file check (false → empty)
    mockFs.existsSync
      .mockReturnValueOnce(false) // ensureDir for readStore
      .mockReturnValueOnce(false) // credentials file doesn't exist
      .mockReturnValueOnce(true)  // ensureDir for writeStore
      .mockReturnValueOnce(true); // ensureDir for second readStore (not called)

    store.saveCredentials(testCreds);

    // Verify writeFileSync was called with correct data
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      CREDENTIALS_PATH,
      expect.stringContaining("bot_test123"),
      { mode: 0o600 },
    );
  });

  it("returns undefined for missing credentials", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(store.getCredentials("nonexistent")).toBeUndefined();
  });

  it("returns stored credentials", () => {
    const storeData = { agents: { "test-agent": testCreds } };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(storeData));

    const result = store.getCredentials("test-agent");
    expect(result).toEqual(testCreds);
  });
});

describe("listAgents", () => {
  it("returns empty array when no agents", () => {
    mockFs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(store.listAgents()).toEqual([]);
  });

  it("returns agent names", () => {
    const storeData = { agents: { "agent-a": testCreds, "agent-b": { ...testCreds, name: "agent-b" } } };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(storeData));

    expect(store.listAgents()).toEqual(["agent-a", "agent-b"]);
  });
});

describe("removeCredentials", () => {
  it("returns false for missing agent", () => {
    mockFs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(store.removeCredentials("nonexistent")).toBe(false);
  });

  it("returns true and removes existing agent", () => {
    const storeData = { agents: { "test-agent": testCreds } };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(storeData));

    expect(store.removeCredentials("test-agent")).toBe(true);
    expect(mockFs.writeFileSync).toHaveBeenCalled();

    // The written data should have empty agents
    const writtenData = JSON.parse(mockFs.writeFileSync.mock.calls[0][1]);
    expect(writtenData.agents).toEqual({});
  });
});

describe("saveAuthSession / getAuthSession", () => {
  it("saves session with correct permissions", () => {
    mockFs.existsSync.mockReturnValue(true);
    store.saveAuthSession(testSession);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      AUTH_PATH,
      expect.stringContaining("token_abc"),
      { mode: 0o600 },
    );
  });

  it("returns undefined when no session file", () => {
    mockFs.existsSync
      .mockReturnValueOnce(true) // ensureDir
      .mockReturnValueOnce(false); // auth file doesn't exist
    expect(store.getAuthSession()).toBeUndefined();
  });

  it("returns stored session", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(testSession));

    expect(store.getAuthSession()).toEqual(testSession);
  });

  it("returns undefined on corrupted JSON", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("not-json{{{");

    expect(store.getAuthSession()).toBeUndefined();
  });
});

describe("clearAuthSession", () => {
  it("returns true and deletes file when it exists", () => {
    mockFs.existsSync.mockReturnValue(true);
    expect(store.clearAuthSession()).toBe(true);
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(AUTH_PATH);
  });

  it("returns false when no session file", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(store.clearAuthSession()).toBe(false);
    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
  });
});

describe("corrupted credentials store", () => {
  it("returns empty store instead of crashing", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("corrupted{{{json");

    // Should not throw, should return undefined (empty agents)
    expect(store.getCredentials("anything")).toBeUndefined();
  });
});

describe("directory creation", () => {
  it("creates .botid directory with 0700 permissions", () => {
    mockFs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(false);
    store.getCredentials("test");

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      "/mock-home/.botid",
      { mode: 0o700 },
    );
  });

  it("skips directory creation when it already exists", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ agents: {} }));

    store.getCredentials("test");
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });
});
