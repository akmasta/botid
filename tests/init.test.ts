import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock store and verify before importing init
vi.mock("../src/store", () => ({
  getCredentials: vi.fn(),
  saveCredentials: vi.fn(),
  getAuthSession: vi.fn(),
}));

vi.mock("../src/verify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/verify")>();
  return {
    ...actual,
    generateKeypair: vi.fn(() => ({
      publicKey: "mock_pub_key_hex",
      privateKey: "mock_priv_key_hex",
    })),
  };
});

import { init } from "../src/init";
import { getCredentials, saveCredentials, getAuthSession } from "../src/store";
import { generateKeypair } from "../src/verify";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.clearAllMocks();
  delete process.env.BOTID_TOKEN;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.BOTID_TOKEN;
});

describe("init — existing credentials", () => {
  it("returns client from stored credentials without network call", async () => {
    vi.mocked(getCredentials).mockReturnValue({
      botId: "bot_existing",
      privateKey: "existing_key",
      name: "my-agent",
      deployer: "user@github",
      apiUrl: "https://botid.net",
      createdAt: "2025-01-01",
    });

    const client = await init({ name: "my-agent" });

    expect(client.botId).toBe("bot_existing");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(generateKeypair).not.toHaveBeenCalled();
  });
});

describe("init — new registration", () => {
  beforeEach(() => {
    vi.mocked(getCredentials).mockReturnValue(undefined);
  });

  it("registers with explicit accessToken", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true, botId: "bot_new", deployer: "user@github" }),
      { status: 200 },
    ));

    const client = await init({ name: "new-agent", accessToken: "explicit_token" });

    expect(client.botId).toBe("bot_new");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://botid.net/api/register",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer explicit_token",
        }),
      }),
    );
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: "bot_new",
        name: "new-agent",
        deployer: "user@github",
      }),
    );
  });

  it("uses BOTID_TOKEN env var as fallback", async () => {
    process.env.BOTID_TOKEN = "env_token";
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true, botId: "bot_env", deployer: "user@github" }),
      { status: 200 },
    ));

    await init({ name: "env-agent" });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer env_token");
  });

  it("uses stored session as last fallback", async () => {
    vi.mocked(getAuthSession).mockReturnValue({
      accessToken: "session_token",
      apiUrl: "https://botid.net",
      authenticatedAt: "2025-01-01",
    });

    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true, botId: "bot_session", deployer: "user@github" }),
      { status: 200 },
    ));

    await init({ name: "session-agent" });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer session_token");
  });

  it("prefers explicit token over env var and session", async () => {
    process.env.BOTID_TOKEN = "env_token";
    vi.mocked(getAuthSession).mockReturnValue({
      accessToken: "session_token",
      apiUrl: "https://botid.net",
      authenticatedAt: "2025-01-01",
    });

    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true, botId: "bot_explicit", deployer: "user@github" }),
      { status: 200 },
    ));

    await init({ name: "explicit-agent", accessToken: "explicit_token" });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer explicit_token");
  });
});

describe("init — error cases", () => {
  beforeEach(() => {
    vi.mocked(getCredentials).mockReturnValue(undefined);
  });

  it("throws when no authentication available", async () => {
    vi.mocked(getAuthSession).mockReturnValue(undefined);

    await expect(init({ name: "no-auth" })).rejects.toThrow(
      "Authentication required",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on HTTP error from registration", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 401 }));

    await expect(
      init({ name: "fail-agent", accessToken: "token" }),
    ).rejects.toThrow("BotID registration failed (HTTP 401)");
  });

  it("throws when response indicates failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ success: false, error: "Name taken" }),
      { status: 200 },
    ));

    await expect(
      init({ name: "taken-agent", accessToken: "token" }),
    ).rejects.toThrow("BotID registration failed: Name taken");
  });

  it("does not leak response body in error", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      "sensitive internal error details",
      { status: 500 },
    ));

    try {
      await init({ name: "leak-test", accessToken: "token" });
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain("sensitive");
      expect(message).toContain("HTTP 500");
    }
  });
});
