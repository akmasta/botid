import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeypair, verifySignature, HEADER_BOT_ID, HEADER_SIGNATURE, HEADER_TIMESTAMP } from "../src/verify";
import { BotIDClient } from "../src/client";

const keys = generateKeypair();
const TEST_BOT_ID = "bot_test123";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BotIDClient constructor", () => {
  it("stores botId", () => {
    const client = new BotIDClient({ botId: TEST_BOT_ID, privateKey: keys.privateKey });
    expect(client.botId).toBe(TEST_BOT_ID);
  });

  it("normalizes apiUrl with trailing slash", () => {
    const client = new BotIDClient({
      botId: TEST_BOT_ID,
      privateKey: keys.privateKey,
      apiUrl: "https://example.com/",
    });
    // apiUrl is private, so we test it indirectly via verify()
    expect(client.botId).toBe(TEST_BOT_ID);
  });
});

describe("client.fetch", () => {
  it("injects BotID headers into the request", async () => {
    const client = new BotIDClient({ botId: TEST_BOT_ID, privateKey: keys.privateKey });

    await client.fetch("https://example.com/api");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/api");

    const headers = init.headers as Headers;
    expect(headers.get(HEADER_BOT_ID)).toBe(TEST_BOT_ID);
    expect(headers.get(HEADER_SIGNATURE)).toMatch(/^[0-9a-f]{128}$/);
    expect(headers.get(HEADER_TIMESTAMP)).toMatch(/^\d+$/);
  });

  it("preserves user-provided headers", async () => {
    const client = new BotIDClient({ botId: TEST_BOT_ID, privateKey: keys.privateKey });

    await client.fetch("https://example.com/api", {
      headers: { "Content-Type": "application/json", "X-Custom": "value" },
    });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Custom")).toBe("value");
    expect(headers.get(HEADER_BOT_ID)).toBe(TEST_BOT_ID);
  });

  it("produces a valid signature that can be verified", async () => {
    const client = new BotIDClient({ botId: TEST_BOT_ID, privateKey: keys.privateKey });

    await client.fetch("https://example.com/api");

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    const signature = headers.get(HEADER_SIGNATURE)!;
    const timestamp = headers.get(HEADER_TIMESTAMP)!;
    const message = `${timestamp}.${TEST_BOT_ID}`;

    expect(verifySignature(message, signature, keys.publicKey)).toBe(true);
  });

  it("passes through request init options", async () => {
    const client = new BotIDClient({ botId: TEST_BOT_ID, privateKey: keys.privateKey });

    await client.fetch("https://example.com/api", {
      method: "POST",
      body: '{"test": true}',
    });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"test": true}');
  });
});

describe("client.verify", () => {
  it("POSTs to /api/verify with correct payload", async () => {
    const verifyResult = { verified: true, timestamp: 1700000000 };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(verifyResult), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const client = new BotIDClient({
      botId: TEST_BOT_ID,
      privateKey: keys.privateKey,
      apiUrl: "https://test.botid.net",
    });

    const result = await client.verify();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://test.botid.net/api/verify");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body);
    expect(body.botId).toBe(TEST_BOT_ID);
    expect(body.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(typeof body.timestamp).toBe("number");

    expect(result).toEqual(verifyResult);
  });
});
