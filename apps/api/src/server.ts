/**
 * Dev server for the contracts.
 *
 * Node's built-in `http`, no framework, no dependencies. Its only job is to
 * give Codex something real to call while the Supabase project does not exist:
 * every contract answers here, in its final shape, with honest states for the
 * ones that need credentials nobody has yet.
 *
 * This is not the production deployment. Production is Supabase Edge Functions
 * wrapping the same `handle()` from `router.ts`.
 */

import { createServer } from 'node:http';

import { createPorts } from './config';
import { handle } from './router';

const PORT = Number(process.env.PORT ?? 5185);

/**
 * Ports come from the environment, and every one of them is optional. Whatever
 * is not configured stays absent, and the handlers that need it answer
 * `source_available` naming the missing key. Nothing is faked.
 *
 * For a fully working local backend without Supabase:
 *   NIHI_DEV_STORE=memory SESSION_SIGNING_KEY=$(openssl rand -hex 32) npm run api
 */
const { ports, lines } = createPorts();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Dev-only. The shipped app talks to Supabase over its own origin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    void (async () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown = undefined;
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw);
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'invalid_json', message: 'Body is not JSON.' } }));
          return;
        }
      }

      const authorization = req.headers.authorization ?? '';
      const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

      try {
        const { status, envelope } = await handle(
          {
            method: req.method ?? 'GET',
            path: url.pathname,
            query: url.searchParams,
            body,
            bearer,
          },
          ports,
        );
        console.info(
          `${req.method} ${url.pathname} → ${status} ${envelope.state}${
            envelope.fallback_reason ? ' (degraded)' : ''
          }`,
        );
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(envelope, null, 2));
      } catch (cause) {
        // A handler throwing is a bug in us, never the caller's fault to fix.
        console.error('unhandled', cause);
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            contract: 'api/unknown',
            version: '1',
            state: 'source_available',
            fallback_reason: 'Unhandled server error.',
            data: null,
            error: { code: 'internal_error', message: 'Something went wrong.' },
            generated_at: new Date().toISOString(),
          }),
        );
      }
    })();
  });
});

server.listen(PORT, () => {
  console.info(`nihi contracts API on http://localhost:${PORT}`);
  for (const line of lines) console.info(`  ${line}`);
  console.info('  contracts 1, 2, 5, 6, 7 need none of the above and are always live');
});
