import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock store before importing auth
vi.mock("../src/store", () => ({
  saveAuthSession: vi.fn(),
  getAuthSession: vi.fn(),
  clearAuthSession: vi.fn(),
}));

import { requestDeviceCode, pollDeviceAuth, isLoggedIn, getAccessToken, logout } from "../src/auth";
import { getAuthSession, clearAuthSession } from "../src/store";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestDeviceCode", () => {
  it("POSTs to /api/device/code and returns response", async () => {
    const deviceCodeResponse = {
      deviceCode: "dc_abc",
      userCode: "ABCD-1234",
      verificationUrl: "https://botid.net/device",
      expiresIn: 900,
      interval: 5,
    };

    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify(deviceCodeResponse),
      { status: 200 },
    ));

    const result = await requestDeviceCode("https://botid.net");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://botid.net/api/device/code",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(deviceCodeResponse);
  });

  it("throws on non-200 response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));

    await expect(requestDeviceCode()).rejects.toThrow("Failed to request device code (500)");
  });

  it("uses default API URL when none provided", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ deviceCode: "dc", userCode: "UC", verificationUrl: "", expiresIn: 900, interval: 5 }),
      { status: 200 },
    ));

    await requestDeviceCode();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://botid.net/api/device/code",
      expect.anything(),
    );
  });
});

describe("pollDeviceAuth", () => {
  it("returns complete response with access token", async () => {
    const pollResponse = { status: "complete", accessToken: "token_xyz" };

    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify(pollResponse),
      { status: 200 },
    ));

    const result = await pollDeviceAuth("dc_abc");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://botid.net/api/device/poll",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ deviceCode: "dc_abc" }),
      }),
    );
    expect(result).toEqual(pollResponse);
  });

  it("handles 202 pending response", async () => {
    const pendingResponse = { status: "pending" };

    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify(pendingResponse),
      { status: 202 },
    ));

    const result = await pollDeviceAuth("dc_abc");
    expect(result.status).toBe("pending");
  });

  it("throws on unexpected HTTP error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));

    await expect(pollDeviceAuth("dc_abc")).rejects.toThrow("Device poll failed (500)");
  });
});

describe("isLoggedIn", () => {
  it("returns false when no session", () => {
    vi.mocked(getAuthSession).mockReturnValue(undefined);
    expect(isLoggedIn()).toBe(false);
  });

  it("returns true when session exists", () => {
    vi.mocked(getAuthSession).mockReturnValue({
      accessToken: "token",
      apiUrl: "https://botid.net",
      authenticatedAt: "2025-01-01",
    });
    expect(isLoggedIn()).toBe(true);
  });

  it("returns false when session exists but apiUrl mismatches", () => {
    vi.mocked(getAuthSession).mockReturnValue({
      accessToken: "token",
      apiUrl: "https://botid.net",
      authenticatedAt: "2025-01-01",
    });
    expect(isLoggedIn("https://other.com")).toBe(false);
  });

  it("returns true when apiUrl matches", () => {
    vi.mocked(getAuthSession).mockReturnValue({
      accessToken: "token",
      apiUrl: "https://botid.net",
      authenticatedAt: "2025-01-01",
    });
    expect(isLoggedIn("https://botid.net")).toBe(true);
  });
});

describe("getAccessToken", () => {
  it("returns undefined when no session", () => {
    vi.mocked(getAuthSession).mockReturnValue(undefined);
    expect(getAccessToken()).toBeUndefined();
  });

  it("returns token when session exists", () => {
    vi.mocked(getAuthSession).mockReturnValue({
      accessToken: "token_abc",
      apiUrl: "https://botid.net",
      authenticatedAt: "2025-01-01",
    });
    expect(getAccessToken()).toBe("token_abc");
  });

  it("returns undefined when apiUrl mismatches", () => {
    vi.mocked(getAuthSession).mockReturnValue({
      accessToken: "token_abc",
      apiUrl: "https://botid.net",
      authenticatedAt: "2025-01-01",
    });
    expect(getAccessToken("https://other.com")).toBeUndefined();
  });
});

describe("logout", () => {
  it("delegates to clearAuthSession", () => {
    vi.mocked(clearAuthSession).mockReturnValue(true);
    expect(logout()).toBe(true);
    expect(clearAuthSession).toHaveBeenCalled();
  });

  it("returns false when no session to clear", () => {
    vi.mocked(clearAuthSession).mockReturnValue(false);
    expect(logout()).toBe(false);
  });
});
