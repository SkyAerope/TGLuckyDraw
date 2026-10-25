import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { createWssClient, dcEndpoint } from '../src/lib/telegram-wss.js';
import { getRandomMessage, withTimeout } from '../src/lib/telegram.ts';

test('all DCs and download endpoints use official WSS port', () => {
  for (let id = 1; id <= 5; id++) {
    assert.equal(dcEndpoint(id).port, 443);
    assert.match(dcEndpoint(id, true).ipAddress, /-1\.web\.telegram\.org$/);
  }
  assert.throws(() => dcEndpoint(6));
});

test('session domain and TCP port are normalized; cleanup refuses late connects', async () => {
  const session = new StringSession('');
  session.setDC(5, 'flora.web.telegram.org', 80);
  const { client, forceClose } = createWssClient(session, { apiId: 1, apiHash: 'test' });
  assert.equal(session.serverAddress, 'flora.web.telegram.org');
  assert.equal(session.port, 443);
  assert.deepEqual(await client.getDC(2), dcEndpoint(2));
  forceClose();
  const socket = new client.networkSocket();
  await assert.rejects(socket.connect(443, 'flora.web.telegram.org'));
  await client.destroy();
});

test('deadline returns promptly, including never-settling operations', async () => {
  const start = Date.now();
  await assert.rejects(withTimeout(() => new Promise(() => {}), 25), { code: 'TIMEOUT' });
  assert.ok(Date.now() - start < 500);
  assert.equal(await withTimeout(async () => 1, 100), 1);
});

test('missing configuration fails before connecting', async () => {
  const session = process.env.TELEGRAM_SESSION;
  delete process.env.TELEGRAM_SESSION;
  try { await assert.rejects(getRandomMessage(), { code: 'CONFIGURATION' }); }
  finally { if (session !== undefined) process.env.TELEGRAM_SESSION = session; }
});

test('bounded sampling, sanitized failures and hung connection cleanup', async () => {
  const previous = { session: process.env.TELEGRAM_SESSION, channel: process.env.TELEGRAM_CHANNEL_ID };
  const original = { connect: TelegramClient.prototype.connect, getMessages: TelegramClient.prototype.getMessages, destroy: TelegramClient.prototype.destroy };
  // Synthetic session with no real account/key; no operation in this test uses a network.
  const host = Buffer.from('flora.web.telegram.org');
  const length = Buffer.alloc(2); length.writeInt16BE(host.length);
  process.env.TELEGRAM_SESSION = '1' + Buffer.concat([Buffer.from([5]), length, host, Buffer.from([0, 80]), Buffer.alloc(256)]).toString('base64');
  process.env.TELEGRAM_CHANNEL_ID = 'test-channel';
  let destroyed = 0;
  let calls = 0;
  TelegramClient.prototype.destroy = async function () { destroyed++; };
  TelegramClient.prototype.connect = async function () { return true; };
  TelegramClient.prototype.getMessages = async function (_channel, options) {
    calls++;
    if (options.limit) return [{ id: 10, message: 'fixture', date: 1 }];
    assert.ok(options.ids.length <= 20);
    return [];
  };
  try {
    const result = await getRandomMessage();
    assert.deepEqual(Object.keys(result).sort(), ['messageTime', 'randomMessage']);
    assert.equal(calls, 2);
    assert.equal(destroyed, 1);
    TelegramClient.prototype.connect = async function () { throw new Error('private upstream detail'); };
    await assert.rejects(getRandomMessage(), error => error.code === 'UNAVAILABLE' && !error.message.includes('private'));
    TelegramClient.prototype.connect = async function () { return new Promise(() => {}); };
    const start = Date.now();
    await assert.rejects(getRandomMessage(), { code: 'TIMEOUT' });
    assert.ok(Date.now() - start < 4750);
    assert.equal(destroyed, 3);
  } finally {
    Object.assign(TelegramClient.prototype, original);
    for (const [key, value] of [['TELEGRAM_SESSION', previous.session], ['TELEGRAM_CHANNEL_ID', previous.channel]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
