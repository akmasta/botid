import readline from "node:readline";
import { init } from "./init";
import { listAgents, getCredentials, getAuthSession } from "./store";
import { deviceLogin, isLoggedIn, getAccessToken, logout } from "./auth";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function log(msg: string): void {
  console.log(msg);
}

function error(msg: string): void {
  console.error(`Error: ${msg}`);
}

function parseApiUrl(args: string[]): string | undefined {
  const idx = args.indexOf("--api-url");
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return process.env.BOTID_API_URL || undefined;
}

async function loginCommand(args: string[]): Promise<void> {
  const apiUrl = parseApiUrl(args);

  // Check for BOTID_TOKEN env var (CI/CD use case)
  if (process.env.BOTID_TOKEN) {
    log("");
    log("  Already authenticated via BOTID_TOKEN environment variable.");
    log("");
    return;
  }

  if (isLoggedIn(apiUrl)) {
    log("");
    log("  Already logged in. Run `botid logout` to switch accounts.");
    log("");
    return;
  }

  log("");
  log("  BotID — Sign in with GitHub");
  log("  ============================");
  log("");

  try {
    await deviceLogin({
      apiUrl,
      onPrompt(verificationUrl, userCode) {
        log(`  Open this URL in your browser:`);
        log("");
        log(`    ${verificationUrl}`);
        log("");
        log(`  And enter code: ${userCode}`);
        log("");
        log("  Waiting for authentication...");
      },
      onOpen() {
        log("  (Browser opened automatically)");
      },
    });

    log("");
    log("  Authenticated successfully!");
    log("  Session stored in ~/.botid/auth.json");
    log("");
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function logoutCommand(): void {
  log("");
  if (logout()) {
    log("  Logged out. Session removed from ~/.botid/auth.json");
  } else {
    log("  Not currently logged in.");
  }
  log("");
}

async function initCommand(args: string[]): Promise<void> {
  const apiUrl = parseApiUrl(args);

  log("");
  log("  BotID — Register Agent");
  log("  =======================");
  log("");

  // Require authentication (either device login or BOTID_TOKEN env var)
  let accessToken = process.env.BOTID_TOKEN ?? getAccessToken(apiUrl);

  if (!accessToken) {
    log("  You need to sign in first.");
    log("");

    try {
      accessToken = await deviceLogin({
        apiUrl,
        onPrompt(verificationUrl, userCode) {
          log(`  Open this URL in your browser:`);
          log("");
          log(`    ${verificationUrl}`);
          log("");
          log(`  And enter code: ${userCode}`);
          log("");
          log("  Waiting for authentication...");
        },
        onOpen() {
          log("  (Browser opened automatically)");
        },
      });

      log("");
      log("  Authenticated!");
      log("");
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  const name = await ask("  Agent name: ");
  if (!name) {
    error("Agent name is required.");
    process.exit(1);
  }

  log("");
  log("  Registering agent...");

  try {
    const client = await init({ name, accessToken, apiUrl });
    log("");
    log("  Agent registered successfully!");
    log("");
    log(`  Bot ID:  ${client.botId}`);
    log("  Keys:    stored in ~/.botid/credentials.json");
    log("");
    log("  Usage in your code:");
    log("");
    log('    import { BotID } from "botid";');
    log("");
    log(`    const agent = await BotID.init({ name: "${name}" });`);
    log('    await agent.fetch("https://api.example.com/data");');
    log("");
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function statusCommand(): void {
  const agents = listAgents();

  log("");
  log("  BotID — Registered Agents");
  log("  ==========================");
  log("");

  if (agents.length === 0) {
    log('  No agents registered. Run "botid init" to get started.');
    log("");
    return;
  }

  for (const name of agents) {
    const creds = getCredentials(name);
    if (!creds) continue;
    log(`  ${name}`);
    log(`    Bot ID:     ${creds.botId}`);
    log(`    Deployer:   ${creds.deployer}`);
    log(`    Registered: ${creds.createdAt}`);
    log("");
  }
}

function whoamiCommand(): void {
  log("");

  if (process.env.BOTID_TOKEN) {
    log("  Authenticated via BOTID_TOKEN environment variable.");
    log("");
    return;
  }

  const session = getAuthSession();

  if (!session) {
    log("  Not logged in. Run `botid login` to authenticate.");
  } else {
    log(`  Logged in`);
    log(`    API:  ${session.apiUrl}`);
    log(`    Since: ${session.authenticatedAt}`);
  }
  log("");
}

function helpCommand(): void {
  log("");
  log("  BotID CLI — Identity for AI Agents");
  log("");
  log("  Usage:");
  log("    botid login  [--api-url <url>]   Sign in with GitHub");
  log("    botid logout                     Sign out");
  log("    botid init   [--api-url <url>]   Register a new agent");
  log("    botid status                     List registered agents");
  log("    botid whoami                     Show current auth status");
  log("    botid help                       Show this help message");
  log("");
  log("  Environment variables:");
  log("    BOTID_TOKEN     Access token for CI/CD (skips device login)");
  log("    BOTID_API_URL   Registry URL (default: https://botid.net)");
  log("");
  log("  Learn more: https://botid.net");
  log("");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";

  switch (command) {
    case "login":
      await loginCommand(args.slice(1));
      break;
    case "logout":
      logoutCommand();
      break;
    case "init":
      await initCommand(args.slice(1));
      break;
    case "status":
      statusCommand();
      break;
    case "whoami":
      whoamiCommand();
      break;
    case "help":
    case "--help":
    case "-h":
      helpCommand();
      break;
    default:
      error(`Unknown command: ${command}`);
      helpCommand();
      process.exit(1);
  }
}

main();
