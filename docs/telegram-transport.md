# Telegram transport and failure handling

The reader and `TGLogin.js` share `src/lib/telegram-wss.js`: GramJS's
`PromisedWebSockets`, its bundled `websocket` implementation and
`ConnectionTCPObfuscated`. A StringSession's DC ID is mapped to the official
Telegram web DC host on port 443, regardless of its saved TCP IP/domain/port.
DC migrations and download endpoints use the same mapping.

`HTTPS_PROXY` (including lowercase) or `HTTP_PROXY` is used when configured.
Without a proxy the transport connects directly to WSS, as on Vercel.
There is no environment-specific proxy hostname or TLS verification bypass.

The homepage returns without contacting Telegram and loads the API in the
browser. The API has a 7 second total operation budget, a 4 second connect
budget, 1.5 second RPC budgets and 250 ms cleanup budget. Each WSS handshake
has a 2.5 second deadline; GramJS has at most two connection attempts, one RPC
attempt, no automatic reconnection and no automatic flood-wait sleep. Sampling
uses at most 20 random IDs in one batch, with the latest text as a fallback.
All outcomes close pending and open sockets and destroy the proxy agent.
Late connection attempts after cleanup are rejected.

Failures return HTTP 503 with a generic Chinese message, a non-sensitive code,
`Cache-Control: no-store` and `Retry-After: 5`. Configuration, timeout, upstream
failure and empty results are distinguishable without exposing RPC/account data.
The browser has a 9 second deadline and restores the retry button after failure.

Run `node --test tests/telegram.test.mjs` on Node 24 to check normalization,
deadlines, finite sampling, sanitized failures and cleanup without credentials.
`node TGLogin.js --check` is anonymous: it connects and checks that authorization
is false, without requesting a code or sending a message. Application checks are
`pnpm install --frozen-lockfile`, `pnpm check` and `pnpm build` with the pinned
Node/pnpm versions. An authenticated channel read requires the configured runtime
session and channel; never print message bodies, session data or complete errors.
