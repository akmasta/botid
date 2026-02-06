import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeypair, signMessage } from "../src/verify";
import { verifyBotID } from "../src/middleware";

const keys = generateKeypair();
const TEST_BOT_ID = "bot_mw_test";

let fetchMock: ReturnType<typeof vi.fn>;

function mockReq(headers: Record<string, string> = {}) {
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowered[k.toLowerCase()] = v;
  }
  return { headers: lowered } as any;
}

function mockRes() {
  const res: any = { statusCode: 0, body: null };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; });
  return res;
}

function validHeaders(timestamp?: number) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const message = `${ts}.${TEST_BOT_ID}`;
  const signature = signMessage(message, keys.privateKey);
  return {
    "x-botid": TEST_BOT_ID,
    "x-botid-signature": signature,
    "x-botid-timestamp": String(ts),
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifyBotID — no headers", () => {
  it("returns 403 when requireVerified is true (default)", async () => {
    const middleware = verifyBotID();
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "BotID verification required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when requireVerified is false", async () => {
    const middleware = verifyBotID({ requireVerified: false });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.BotID).toBeDefined();
    expect(req.BotID.verified).toBe(false);
  });
});

describe("verifyBotID — incomplete headers", () => {
  it("returns 400 when only some headers present", async () => {
    const middleware = verifyBotID();
    const req = mockReq({ "x-botid": TEST_BOT_ID }); // missing signature + timestamp
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Incomplete BotID headers" });
  });

  it("calls next in passive mode with incomplete headers", async () => {
    const middleware = verifyBotID({ requireVerified: false });
    const req = mockReq({ "x-botid": TEST_BOT_ID });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.BotID.verified).toBe(false);
  });
});

describe("verifyBotID — stale timestamp", () => {
  it("rejects timestamp beyond 5-minute window", async () => {
    const middleware = verifyBotID();
    const staleTs = Math.floor(Date.now() / 1000) - 301;
    const req = mockReq(validHeaders(staleTs));
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Timestamp outside valid window" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows stale timestamp in passive mode but flags it", async () => {
    const middleware = verifyBotID({ requireVerified: false });
    const staleTs = Math.floor(Date.now() / 1000) - 301;
    const req = mockReq(validHeaders(staleTs));
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.BotID.verified).toBe(false);
    expect(req.BotID.error).toBe("Timestamp outside valid window");
  });
});

describe("verifyBotID — valid signature", () => {
  it("verifies and calls next", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ publicKey: keys.publicKey }),
      { status: 200 },
    ));

    const middleware = verifyBotID();
    const req = mockReq(validHeaders());
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.BotID.verified).toBe(true);
    expect(req.BotID.bot.id).toBe(TEST_BOT_ID);
  });
});

describe("verifyBotID — invalid signature", () => {
  it("rejects in strict mode", async () => {
    // Return a different bot's public key → signature won't match
    const otherKeys = generateKeypair();
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ publicKey: otherKeys.publicKey }),
      { status: 200 },
    ));

    const middleware = verifyBotID();
    const req = mockReq(validHeaders());
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Bot identity verification failed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next in passive mode with verified=false", async () => {
    const otherKeys = generateKeypair();
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ publicKey: otherKeys.publicKey }),
      { status: 200 },
    ));

    const middleware = verifyBotID({ requireVerified: false });
    const req = mockReq(validHeaders());
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.BotID.verified).toBe(false);
  });
});

describe("verifyBotID — revoked bot", () => {
  it("returns 403 with revoked flag", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ revoked: true }),
      { status: 403 },
    ));

    const middleware = verifyBotID();
    const req = mockReq(validHeaders());
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ revoked: true }),
    );
    expect(req.BotID.revoked).toBe(true);
  });

  it("calls next in passive mode with revoked flag", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ revoked: true }),
      { status: 403 },
    ));

    const middleware = verifyBotID({ requireVerified: false });
    const req = mockReq(validHeaders());
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.BotID.revoked).toBe(true);
    expect(req.BotID.verified).toBe(false);
  });
});

describe("verifyBotID — network error", () => {
  it("returns 503 in strict mode", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));

    const middleware = verifyBotID();
    const req = mockReq(validHeaders());
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next in passive mode with error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));

    const middleware = verifyBotID({ requireVerified: false });
    const req = mockReq(validHeaders());
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.BotID.verified).toBe(false);
    expect(req.BotID.error).toBe("Verification service unavailable");
  });
});

describe("verifyBotID — onUnverified callback", () => {
  it("calls custom handler instead of default 403", async () => {
    const onUnverified = vi.fn();
    const middleware = verifyBotID({ onUnverified });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(onUnverified).toHaveBeenCalledWith(req, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
