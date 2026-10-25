import { getRandomMessage, TelegramUnavailable } from '../../lib/telegram';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    const message = await getRandomMessage();
    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: '暂时无法获取消息，请稍后重试。', code: error instanceof TelegramUnavailable ? error.code : 'UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '5' } }
    );
  }
}
