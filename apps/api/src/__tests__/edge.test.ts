import { describe, expect, it } from 'vitest';

import type { Ports } from '@mahjong-brain/core/contracts';

import { handleEdgeRequest } from '../edge';

const ports: Ports = {};

describe('Supabase Edge request adapter', () => {
  it('strips the function prefix and routes a live anonymous contract', async () => {
    const response = await handleEdgeRequest(
      new Request('https://project.supabase.co/functions/v1/contracts/api/game/board/generate?seed=7'),
      ports,
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.contract).toBe('game/board/generate');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('answers preflight without invoking a contract', async () => {
    const response = await handleEdgeRequest(
      new Request('https://project.supabase.co/functions/v1/contracts/api/settings', { method: 'OPTIONS' }),
      ports,
    );
    expect(response.status).toBe(204);
  });

  it('fails closed on invalid JSON', async () => {
    const response = await handleEdgeRequest(
      new Request('https://project.supabase.co/functions/v1/contracts/api/settings', {
        method: 'PATCH',
        body: '{bad',
      }),
      ports,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'invalid_json', message: 'Body is not JSON.' } });
  });
});
