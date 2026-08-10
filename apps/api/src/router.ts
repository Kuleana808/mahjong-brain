/**
 * Transport-independent routing for the ten contracts.
 *
 * Deliberately not tied to Node's `http`: the same `handle()` takes a method,
 * a path, a query, a body and a bearer token and returns an envelope. The dev
 * server wraps it, and a Supabase Edge Function will wrap the same function
 * without the handlers learning anything about either.
 */

import {
  authenticateWithApple,
  claimDailyReward,
  generateBoard,
  generateHint,
  getDailyReward,
  getSettings,
  httpStatus,
  ingestEvents,
  logPlayPattern,
  nextBoard,
  patchSettings,
  recordSessionAnalytics,
  unlockStatus,
  validateMove,
  validateReceipt,
  type ContractEnvelope,
  type Ports,
} from '@nihi/core/contracts';
import { fail } from '@nihi/core/contracts';

export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
  readonly bearer: string | null;
}

export interface ApiResponse {
  readonly status: number;
  readonly envelope: ContractEnvelope<unknown>;
}

const num = (value: string | null): number | undefined => {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/**
 * A parsed JSON body is `unknown` until a handler has checked it.
 *
 * Every handler validates its own input and answers with an `invalid_request`
 * envelope when the shape is wrong, so the boundary cast is safe — but it is
 * named rather than inlined, so nobody mistakes it for a validated value.
 */
const unvalidated = <T>(body: unknown): T => (body ?? {}) as T;

export async function handle(request: ApiRequest, ports: Ports): Promise<ApiResponse> {
  const { method, path, query, body, bearer } = request;

  const envelope = await route();
  return { status: httpStatus(envelope), envelope };

  async function route(): Promise<ContractEnvelope<unknown>> {
    // 1
    if (method === 'GET' && path === '/api/game/board/generate') {
      return generateBoard(
        {
          layout: (query.get('layout') ?? 'turtle') as never,
          seed: num(query.get('seed')),
          includeTiles: query.get('includeTiles') === 'true',
        },
        ports,
      );
    }

    // 2
    if (method === 'POST' && path === '/api/game/board/validate-move') {
      return validateMove(unvalidated(body), ports);
    }

    // 3
    if (method === 'POST' && path === '/api/auth/apple-id') {
      return authenticateWithApple(unvalidated(body), ports);
    }

    // 4
    if (path === '/api/settings') {
      if (method === 'GET') return getSettings(bearer, ports);
      if (method === 'PATCH') return patchSettings(bearer, unvalidated(body), ports);
    }

    // 5
    if (method === 'POST' && path === '/api/hints/generate') {
      return generateHint(unvalidated(body), ports);
    }

    // 6
    if (method === 'POST' && path === '/api/play-pattern/log') {
      return logPlayPattern(unvalidated(body), ports);
    }

    // 7
    if (method === 'GET' && path === '/api/difficulty/next-board') {
      const raw = query.get('profile');
      let profile;
      if (raw) {
        try {
          profile = JSON.parse(raw);
        } catch {
          return fail('api/difficulty/next-board', '1', {
            code: 'invalid_request',
            message: 'profile must be JSON.',
            field: 'profile',
          });
        }
      }
      return nextBoard({ profile }, ports);
    }

    // 8
    if (method === 'POST' && path === '/api/receipts/validate') {
      return validateReceipt(unvalidated(body), ports);
    }

    // 9
    if (method === 'GET' && path === '/api/unlock-status') {
      return unlockStatus(bearer, ports);
    }

    // 10
    if (method === 'POST' && path === '/api/analytics/session') {
      return recordSessionAnalytics(unvalidated(body), ports);
    }

    // 11
    if (method === 'POST' && path === '/api/events/batch') {
      return ingestEvents(unvalidated(body), ports);
    }

    // 12
    if (path === '/api/retention/daily') {
      if (method === 'GET') return getDailyReward(bearer, query.get('localDate') ?? '', ports);
      if (method === 'POST') return claimDailyReward(bearer, unvalidated(body), ports);
    }

    return fail('api/unknown', '1', {
      code: 'not_found',
      message: `No contract at ${method} ${path}.`,
    });
  }
}
