/** Web-standard adapter shared by Supabase Edge Functions and its tests. */

import type { Ports } from '@mahjong-brain/core/contracts';

import { handle } from './router';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
};

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: corsHeaders });

export async function handleEdgeRequest(request: Request, ports: Ports): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/functions\/v1\/contracts(?=\/|$)/, '') || '/';
  let body: unknown;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const raw = await request.text();
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: { code: 'invalid_json', message: 'Body is not JSON.' } }, 400);
      }
    }
  }

  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  try {
    const result = await handle(
      { method: request.method, path, query: url.searchParams, body, bearer },
      ports,
    );
    return json(result.envelope, result.status);
  } catch (cause) {
    console.error('unhandled edge request', cause);
    return json(
      {
        contract: 'api/unknown',
        version: '1',
        state: 'source_available',
        fallback_reason: 'Unhandled server error.',
        data: null,
        error: { code: 'internal_error', message: 'Something went wrong.' },
        generated_at: new Date().toISOString(),
      },
      500,
    );
  }
}
