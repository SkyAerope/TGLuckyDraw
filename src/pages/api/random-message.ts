import { getRandomMessage } from '../../lib/telegram';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const message = await getRandomMessage();
    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch a random message.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
