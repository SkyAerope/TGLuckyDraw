import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import * as dotenv from 'dotenv';

dotenv.config();

const session = new StringSession(process.env.TELEGRAM_SESSION) || '';
const apiId = Number(process.env.TELEGRAM_API_ID) || 13098476;
const apiHash = process.env.TELEGRAM_API_HASH || '0be3336d4f492ad5bd5a6fe66cdfc89d';
const channelId = process.env.TELEGRAM_CHANNEL_ID;

export async function getRandomMessage() {
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();

  if (!session) {
    throw new Error('Please set the TELEGRAM_SESSION environment variable.');
  }
  if (!channelId) {
    throw new Error('Please set the TELEGRAM_CHANNEL_ID environment variable.');
  }

  try {
    // 获取最后一条消息的 ID
    const lastMessageResult = await client.getMessages(channelId, { limit: 1 });
    if (lastMessageResult.length === 0) {
      throw new Error('No messages found in the channel.');
    }
    const lastMessageId = lastMessageResult[0].id;

    let randomMessage;
    let messageTime;
    while (!randomMessage) {
      try {
        // 从 1 到最后一条消息的 ID 随机选择一个 ID
        const randomId = Math.floor(Math.random() * lastMessageId) + 1;
        const randomMessageResult = await client.getMessages(channelId, { ids: randomId });

        if (randomMessageResult.length > 0 && randomMessageResult[0].message) {
          randomMessage = randomMessageResult[0].message;
          messageTime = randomMessageResult[0].date;
        }
      } catch (error: any) {
        if (error.message === "TypeError: Cannot read properties of undefined (reading 'message')") {
          continue;
        }
      }
    }
    return { randomMessage, messageTime };
  } catch (error) {
    console.error(error);
    throw new Error('Failed to fetch a random message.');
  } finally {
    await client.disconnect();
  }
}
