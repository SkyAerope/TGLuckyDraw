import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { PromisedWebSockets } from "telegram/extensions/PromisedWebSockets.js";
import { ConnectionTCPObfuscated } from "telegram/network/connection/TCPObfuscated.js";
import { Logger } from "telegram/extensions/Logger.js";
import { createRequire } from "node:module";
import { constants, open, unlink, lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";
import readline from "node:readline";
import dotenv from "dotenv";
import { HttpsProxyAgent } from "https-proxy-agent";

const apiId = 13098476;
const apiHash = "0be3336d4f492ad5bd5a6fe66cdfc89d";

// Resolve the implementations already shipped with the installed GramJS version.
const telegramRequire = createRequire(createRequire(import.meta.url).resolve("telegram"));
const { w3cwebsocket } = telegramRequire("websocket");
const dcHosts = { 1: "pluto", 2: "venus", 3: "aurora", 4: "vesta", 5: "flora" };
const localFile = ".env.telegram";

export function assertSessionDestination(directory = process.cwd()) {
  // Fail before requesting a code if the destination could expose or overwrite data.
  try {
    execFileSync("git", ["check-ignore", "--quiet", "--", localFile], { cwd: directory, stdio: "ignore" });
  } catch {
    throw new Error("Session destination must be untracked and gitignored.");
  }
  const tracked = execFileSync("git", ["ls-files", "--", localFile], { cwd: directory, encoding: "utf8" });
  if (tracked.trim()) throw new Error("Session destination must not be tracked.");
}

export async function saveLocalSession(value, directory = process.cwd()) {
  assertSessionDestination(directory);
  const destination = resolve(directory, localFile);
  // Exclusive creation refuses existing files and symlinks. Never truncate a session.
  const file = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let complete = false;
  try {
    await file.chmod(0o600);
    await file.writeFile(`TELEGRAM_SESSION=${value}\n`, "utf8");
    await file.sync();
    complete = true;
  } finally {
    await file.close();
    if (!complete) await unlink(destination);
  }
}

function privateQuestion(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Login requires a user-controlled private terminal.");
  // readline still handles editing and Ctrl+C, but echoes no input or hints.
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const input = readline.createInterface({ input: process.stdin, output: muted, terminal: true, historySize: 0 });
  process.stdout.write(label);
  return new Promise((resolveAnswer, reject) => {
    let answered = false;
    input.on("SIGINT", () => { input.close(); });
    input.on("close", () => { if (!answered) reject(new Error("Input cancelled.")); });
    input.question("", answer => {
      answered = true;
      input.close();
      process.stdout.write("\n");
      resolveAnswer(answer);
    });
  });
}

export function createWssClient(session, { apiId: configuredId = apiId, apiHash: configuredHash = apiHash } = {}) {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxy) throw new Error("Configured HTTPS proxy is required; no direct fallback.");
  const agent = new HttpsProxyAgent(proxy);
  const sockets = new Set();
  class ProxiedWebSockets extends PromisedWebSockets {
    async connect(port, host, testServers = false) {
      const allowed = Object.values(dcHosts).some(name => host === `${name}.web.telegram.org` || host === `${name}-1.web.telegram.org`);
      if (!allowed || port !== 443 || testServers) throw new Error("Unexpected Telegram WSS endpoint.");
      this.stream = Buffer.alloc(0);
      this.canRead = new Promise(resolveRead => { this.resolveRead = resolveRead; });
      this.closed = false;
      this.website = this.getWebSocketLink(host, port, false);
      this.client = new w3cwebsocket(this.website, "binary", "https://web.telegram.org", undefined, { agent, rejectUnauthorized: true });
      sockets.add(this.client);
      return new Promise((resolveSocket, reject) => {
        this.client.onopen = () => { this.receive(); resolveSocket(this); };
        this.client.onerror = () => reject(new Error("Telegram WSS connection failed."));
        this.client.onclose = () => { this.closed = true; if (this.resolveRead) this.resolveRead(false); };
      });
    }
  }
  const initialDc = session.dcId || 4;
  if (!dcHosts[initialDc]) throw new Error("Unsupported Telegram DC.");
  session.setDC(initialDc, `${dcHosts[initialDc]}.web.telegram.org`, 443);
  const client = new TelegramClient(session, configuredId, configuredHash, {
    networkSocket: ProxiedWebSockets,
    connection: ConnectionTCPObfuscated,
    useWSS: true,
    securityChecks: true,
    connectionRetries: 1,
    requestRetries: 1,
    autoReconnect: false,
    timeout: 5,
    baseLogger: new Logger("none"),
  });
  // Node's getDC defaults to IPs. Force GramJS's built-in official web mapping,
  // including any PHONE_MIGRATE transition during an explicitly requested login.
  const getDC = client.getDC.bind(client);
  client.getDC = (dcId, download = false) => getDC(dcId, download, true);
  const forceClose = () => {
    for (const socket of sockets) {
      try { socket._client?.abort(); socket._connection?.drop(); socket.close(); } catch { /* cleanup only */ }
    }
    agent.destroy();
  };
  return { client, forceClose };
}

export async function main() {
  const checkOnly = process.argv.includes("--check");
  if (!checkOnly && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new Error("Login requires a user-controlled private terminal; no code was requested.");
  }
  dotenv.config({ quiet: true });
  if (!checkOnly) {
    assertSessionDestination();
    try {
      await lstat(localFile);
      throw new Error("Session destination already exists; it will not be overwritten.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const session = new StringSession("");
  // connect() calls save internally. Serialize only after successful user login.
  const serialize = session.save.bind(session);
  session.save = () => "";
  const { client, forceClose } = createWssClient(session, {
    apiId: Number(process.env.TELEGRAM_API_ID) || apiId,
    apiHash: process.env.TELEGRAM_API_HASH || apiHash,
  });
  let connected = false;
  const forceExit = () => { forceClose(); process.exit(1); };
  const deadline = setTimeout(() => {
    process.stdout.write(checkOnly ? "Connection check timed out.\n" : "Login timed out.\n");
    void cleanup().finally(() => process.exit(1));
    setTimeout(forceExit, 500);
  }, checkOnly ? 18000 : 300000);
  async function cleanup() {
    try { await Promise.race([client.disconnect(), new Promise(r => setTimeout(r, 300))]); } finally {
      forceClose();
    }
  }
  const cancel = () => { void cleanup().finally(() => process.exit(1)); setTimeout(forceExit, 500); };
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    connected = await client.connect();
    if (checkOnly) {
      const authorized = await client.isUserAuthorized();
      process.stdout.write(JSON.stringify({ connect: connected, isUserAuthorized: authorized }) + "\n");
      if (!connected || authorized) throw new Error("Unexpected anonymous check result.");
      return;
    }
    await client.start({
      phoneNumber: () => privateQuestion("Phone number (hidden): "),
      phoneCode: () => privateQuestion("Telegram code (hidden): "),
      password: () => privateQuestion("Two-step password (hidden): "),
      onError: () => true, // Abort rather than log RPC errors or request codes repeatedly.
    });
    if (!(await client.isUserAuthorized())) throw new Error("Login did not authorize this session.");
    await saveLocalSession(serialize());
    process.stdout.write("Login succeeded. Session saved to ignored .env.telegram (0600).\n");
  } finally {
    clearTimeout(deadline);
    await cleanup();
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // GramJS contains direct console error calls in addition to its logger.
  // Keep auth details and complete error objects out of terminal captures.
  console.log = console.info = console.warn = console.error = console.debug = () => {};
  const fail = () => { process.stdout.write("Operation failed or cancelled. Login requires a private terminal, configured HTTPS proxy, and an unused gitignored session path; sensitive details suppressed.\n"); process.exit(1); };
  process.on("unhandledRejection", fail);
  main().then(() => process.exit(0), fail);
}
