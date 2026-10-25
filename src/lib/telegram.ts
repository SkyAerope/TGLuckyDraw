import { StringSession } from 'telegram/sessions/index.js';
import * as dotenv from 'dotenv';
import { createWssClient } from './telegram-wss.js';

dotenv.config({ quiet: true });

const apiId = Number(process.env.TELEGRAM_API_ID) || 13098476;
const apiHash = process.env.TELEGRAM_API_HASH || '0be3336d4f492ad5bd5a6fe66cdfc89d';

export class TelegramUnavailable extends Error {
  public code: 'CONFIGURATION' | 'TIMEOUT' | 'UNAVAILABLE' | 'NO_MESSAGES';
  constructor(code: TelegramUnavailable['code']) {
    super('Telegram messages are temporarily unavailable.');
    this.name = 'TelegramUnavailable';
    this.code = code;
  }
}

export async function withTimeout<T>(operation: () => Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TelegramUnavailable('TIMEOUT')), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// A total budget includes connect, channel resolution, RPCs and sampling.
// GramJS's timeout option alone does not bound these operations.
export async function getRandomMessage() {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!process.env.TELEGRAM_SESSION || !channelId) throw new TelegramUnavailable('CONFIGURATION');
  let transport: ReturnType<typeof createWssClient>;
  try {
    transport = createWssClient(new StringSession(process.env.TELEGRAM_SESSION), { apiId, apiHash });
  } catch {
    throw new TelegramUnavailable('CONFIGURATION');
  }
  const { client, forceClose } = transport;
  try {
    return await withTimeout(async () => {
      await withTimeout(() => client.connect(), 4000);
      const latest = await withTimeout(() => client.getMessages(channelId, { limit: 1 }), 1500);
      const lastId = latest[0]?.id;
      if (!lastId) throw new TelegramUnavailable('NO_MESSAGES');
      // Deleted/service messages cannot cause an unbounded loop. Batch random IDs
      // to keep sparse channels useful without retrying arbitrary RPC failures.
      const ids = [...new Set(Array.from({ length: 20 }, () => Math.floor(Math.random() * lastId) + 1))];
      const messages = await withTimeout(() => client.getMessages(channelId, { ids }), 1500);
      const message = messages.find(item => item?.message);
      if (message) return { randomMessage: message.message, messageTime: message.date };
      if (latest[0]?.message) return { randomMessage: latest[0].message, messageTime: latest[0].date };
      throw new TelegramUnavailable('NO_MESSAGES');
    }, 7000);
  } catch (error) {
    throw error instanceof TelegramUnavailable ? error : new TelegramUnavailable('UNAVAILABLE');
  } finally {
    // Stop active and still-connecting sockets before awaiting GramJS cleanup.
    forceClose();
    try { await withTimeout(() => client.destroy(), 250); } catch { /* bounded cleanup */ }
    forceClose();
  }
}
