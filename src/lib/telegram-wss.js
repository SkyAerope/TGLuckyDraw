import { TelegramClient } from 'telegram';
import { PromisedWebSockets } from 'telegram/extensions/PromisedWebSockets.js';
import { ConnectionTCPObfuscated } from 'telegram/network/connection/TCPObfuscated.js';
import { Logger } from 'telegram/extensions/Logger.js';
import { createRequire } from 'node:module';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Use the websocket implementation shipped with GramJS, as in TGLogin.js.
const telegramRequire = createRequire(createRequire(import.meta.url).resolve('telegram'));
const { w3cwebsocket } = telegramRequire('websocket');
const dcHosts = { 1: 'pluto', 2: 'venus', 3: 'aurora', 4: 'vesta', 5: 'flora' };

export function dcEndpoint(dcId, download = false) {
  if (!Object.hasOwn(dcHosts, dcId)) throw new Error('Unsupported Telegram DC.');
  return { id: dcId, ipAddress: `${dcHosts[dcId]}${download ? '-1' : ''}.web.telegram.org`, port: 443 };
}

export function createWssClient(session, { apiId, apiHash, connectTimeoutMs = 2500 }) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  const sockets = new Set();
  let disposed = false;
  class TelegramWebSockets extends PromisedWebSockets {
    async connect(port, host, testServers = false) {
      if (disposed || port !== 443 || testServers || !Object.values(dcHosts).some(name => host === `${name}.web.telegram.org` || host === `${name}-1.web.telegram.org`)) {
        throw new Error('Unexpected or closed Telegram WSS endpoint.');
      }
      this.stream = Buffer.alloc(0);
      this.canRead = new Promise(resolve => { this.resolveRead = resolve; });
      this.closed = false;
      this.website = this.getWebSocketLink(host, 443, false);
      this.client = new w3cwebsocket(this.website, 'binary', 'https://web.telegram.org', undefined, { agent, rejectUnauthorized: true }, { tlsOptions: { rejectUnauthorized: true } });
      sockets.add(this);
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.cancelConnect = undefined;
          if (error) reject(error); else resolve(this);
        };
        const timer = setTimeout(() => { finish(new Error('Telegram WSS connection timed out.')); void this.close(); }, connectTimeoutMs);
        this.cancelConnect = () => finish(new Error('Telegram WSS closed.'));
        this.client.onopen = () => {
          if (disposed || this.closed || settled) { void this.close(); return; }
          this.receive();
          finish();
        };
        this.client.onerror = () => { finish(new Error('Telegram WSS connection failed.')); void this.close(); };
        this.client.onclose = () => { finish(new Error('Telegram WSS closed.')); void this.close(); };
      });
    }
    async close() {
      this.closed = true;
      this.cancelConnect?.();
      this.resolveRead?.(false);
      const socket = this.client;
      this.client = undefined;
      sockets.delete(this);
      if (socket) {
        socket.onopen = socket.onerror = socket.onclose = socket.onmessage = () => {};
        try { socket._client?.abort(); } catch { /* best effort */ }
        try { socket._connection?.drop(); } catch { /* best effort */ }
        try { socket.close(); } catch { /* best effort */ }
      }
    }
  }
  // StringSession may contain a web domain with port 80, or a native DC IP.
  // The DC ID identifies the key's DC; never reuse the serialized TCP port.
  const endpoint = dcEndpoint(session.dcId || 4);
  session.setDC(endpoint.id, endpoint.ipAddress, endpoint.port);
  const client = new TelegramClient(session, apiId, apiHash, {
    networkSocket: TelegramWebSockets,
    connection: ConnectionTCPObfuscated,
    useWSS: true,
    securityChecks: true,
    connectionRetries: 2,
    requestRetries: 1,
    reconnectRetries: 0,
    retryDelay: 100,
    autoReconnect: false,
    floodSleepThreshold: 0,
    timeout: 3,
    baseLogger: new Logger('none'),
  });
  // Keep migrations and exported senders on official WSS endpoints too.
  client.getDC = async (dcId, download = false) => dcEndpoint(dcId, download);
  client.onError = async () => {}; // Never log RPC details or account data.
  const forceClose = () => {
    disposed = true;
    for (const socket of [...sockets]) void socket.close();
    agent?.destroy();
  };
  return { client, forceClose };
}
