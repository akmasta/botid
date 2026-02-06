# BotID

**Identity verification for AI agents.** Your agent signs every request. APIs verify who's calling. One import, zero config.

```typescript
import { BotID } from "botid";

// Requires `botid login` first (GitHub authentication)
const agent = await BotID.init({ name: "my-research-agent" });

// Every request is now signed with Ed25519
await agent.fetch("https://api.example.com/data");
```

---

## The Problem

Every AI agent framework ships agents that make HTTP requests with **zero identity**. When an agent calls an API, the API has no idea which agent is calling, who deployed it, or whether it's legitimate.

BotID fixes this. It's an identity layer for the agentic web.

## How It Works

```
┌────────────┐    X-BotID headers    ┌────────────┐
│  AI Agent  │ ────────────────────► │  API / Web │
│  (signed)  │                       │ (verified) │
└─────┬──────┘                       └──────┬─────┘
      │ signs with Ed25519                  │ looks up public key
      │ private key                         │ from BotID registry
      ▼                                     ▼
┌─────────────────────────────────────────────────┐
│              BotID Registry (botid.net)         │
│  • Stores public keys                           │
│  • Verifies signatures                          │
│  • Issues bot identifiers                       │
│  • GitHub-verified deployer identity            │
└─────────────────────────────────────────────────┘
```

1. Developer authenticates with GitHub via `botid login`
2. Agent registers with BotID and gets an Ed25519 keypair (tied to your GitHub identity)
3. Every outbound request is signed with `X-BotID`, `X-BotID-Signature`, `X-BotID-Timestamp` headers
4. APIs verify the signature against the registry's public key — one line of middleware

## Install

```sh
npm install botid
```

## For Agent Developers

### Step 1: Authenticate

```sh
npx botid login
```

This opens your browser for GitHub sign-in. Your CLI session is linked to your GitHub identity. You only need to do this once.

### Step 2: Register an agent

```sh
npx botid init
```

Or programmatically:

```typescript
import { BotID } from "botid";

// Loads credentials from `botid login`, registers agent, stores keys in ~/.botid/
const agent = await BotID.init({ name: "my-research-agent" });

// Every request includes signed identity headers
const res = await agent.fetch("https://api.example.com/data");
```

### Manual setup (bring your own keys)

```typescript
import { BotIDClient } from "botid";

const client = new BotIDClient({
  botId: "bot_abc123xyz789",
  privateKey: process.env.BOTID_PRIVATE_KEY!,
});

await client.fetch("https://api.example.com/data");
```

### CI/CD

Set the `BOTID_TOKEN` environment variable to skip the browser-based login:

```sh
export BOTID_TOKEN=your_access_token  # from the BotID dashboard
npx botid init
```

### CLI Commands

```
botid login              Sign in with GitHub
botid logout             Sign out
botid init               Register a new agent (requires login)
botid status             List registered agents
botid whoami             Show current auth status
botid help               Show help
```

## For API Owners

Verify incoming bot requests with one line of middleware:

```typescript
import express from "express";
import { verifyBotID } from "botid";

const app = express();

// Strict mode — block unverified requests
app.use("/api", verifyBotID({ requireVerified: true }));

// Passive mode — flag but allow
app.get("/search", verifyBotID({ requireVerified: false }), (req, res) => {
  if (req.BotID?.verified) {
    // Verified agent — give premium access
  }
  res.json({ results: [] });
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `requireVerified` | `boolean` | `true` | Block requests without valid BotID headers |
| `apiUrl` | `string` | `https://botid.net` | BotID registry URL (override for local dev) |
| `onUnverified` | `function` | — | Custom handler for unverified requests |

## Revocation

Bot identities can be revoked by their deployer at any time through the BotID dashboard.

**For agent developers:** A revoked bot receives `403` responses from any API using BotID verification. Reinstate the bot from the dashboard, or register a new one with `botid init`.

**For API owners:** When a revoked bot makes a request, the middleware sets `req.BotID.revoked = true` and blocks it (in strict mode). In passive mode, the request is allowed but flagged:

```typescript
app.get("/data", verifyBotID({ requireVerified: false }), (req, res) => {
  if (req.BotID?.revoked) {
    // Bot identity was revoked — handle accordingly
  }
});
```

## Security

- **Key storage:** Private keys are stored in `~/.botid/credentials.json` with `0600` permissions. They never leave the deployer's machine.
- **Auth sessions:** Stored in `~/.botid/auth.json` with `0600` permissions.
- **Key rotation:** Rotate keys from the BotID dashboard. Existing signatures become invalid immediately.
- **Replay protection:** Signatures include a timestamp. The middleware and verification API both reject signatures older than 5 minutes.
- **No anonymous bots:** Every registration is tied to a verified GitHub account via OAuth.

## Protocol

Every signed request includes three headers:

| Header | Value |
|--------|-------|
| `X-BotID` | The bot's public identifier (e.g. `bot_abc123xyz789`) |
| `X-BotID-Signature` | Ed25519 signature (hex) of `{timestamp}.{botId}.{METHOD}.{pathname}` |
| `X-BotID-Timestamp` | Unix timestamp in seconds |

**Crypto:** Ed25519 with PKCS8 DER (private) and SPKI DER (public) key encoding.
**Request binding:** Signatures include the HTTP method and pathname. A signature for `GET /search` cannot be replayed against `POST /admin`.
**Replay protection:** Signatures older than 5 minutes are rejected.
**Key storage:** Private keys never leave the deployer's machine. The registry only stores public keys.
**Identity:** Every bot is linked to a verified GitHub account. No anonymous registrations.

## API Reference

### `BotID.init(options)`

Auto-register and return a configured client. Requires authentication via `botid login` or `BOTID_TOKEN` env var. Keys are stored in `~/.botid/credentials.json`.

### `BotID.login(options)`

Programmatic device flow login. Opens browser for GitHub authentication.

### `new BotIDClient(options)`

Manual client creation with explicit credentials.

### `client.fetch(url, init?)`

Drop-in `fetch` replacement that signs every request.

### `client.verify()`

Verify this bot's identity against the registry (health check).

### `verifyBotID(options?)`

Express-compatible middleware for verifying incoming bot requests.

### `signMessage(message, privateKeyHex)`

Low-level Ed25519 signing.

### `verifySignature(message, signatureHex, publicKeyHex)`

Low-level Ed25519 verification.

## License

MIT
