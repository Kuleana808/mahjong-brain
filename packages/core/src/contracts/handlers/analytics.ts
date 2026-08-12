/**
 * Contract 10 — session analytics.
 *
 * Opt-in, local-first, no third parties. There is no vendor SDK in this app and
 * there is not going to be one: the App Store privacy label says "no data
 * collected" and keeping that true is worth more than any funnel chart.
 *
 * The consent check happens before anything is read from the body, and a
 * request without consent is discarded rather than queued, sampled, or
 * "anonymised". Off means off.
 *
 * What may be stored: counts and durations, plus a rotating device-local id the
 * player can reset. What may never be stored here: an Apple id, an IDFA, an IP
 * address, a device name, or anything that survives a reinstall.
 */

import { fail, notConfigured, ok, type ContractEnvelope } from '../envelope';
import { nowOf, type Ports } from '../ports';
import {
  CONTRACT_VERSION,
  type SessionAnalyticsRequest,
  type SessionAnalyticsResponse,
} from '../types';

const CONTRACT = 'api/analytics/session';

/** Anything not on this list never reaches storage. */
const ALLOWED_FIELDS = [
  'boardsStarted',
  'boardsCompleted',
  'hintsUsed',
  'totalSeconds',
  'appVersion',
  'anonymousSessionId',
] as const;

export async function recordSessionAnalytics(
  request: SessionAnalyticsRequest,
  ports: Ports = {},
): Promise<ContractEnvelope<SessionAnalyticsResponse>> {
  const now = nowOf(ports);

  // Consent first, before the body is touched.
  if (request?.consent !== true) {
    return ok<SessionAnalyticsResponse>(
      CONTRACT,
      CONTRACT_VERSION,
      { stored: false, reason: 'No consent on this request; the body was discarded.' },
      { now, state: 'live_verified' },
    );
  }

  if (typeof request.anonymousSessionId !== 'string' || request.anonymousSessionId.length < 8) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'A rotating anonymous session id is required.',
      field: 'anonymousSessionId',
    }, { now });
  }

  if (!ports.store) {
    return notConfigured(
      CONTRACT,
      CONTRACT_VERSION,
      ['SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'],
      { now },
    );
  }

  // Allow-list, not deny-list: a field added to the request type later cannot
  // start flowing to storage without someone adding it here on purpose.
  //
  // The map is also the column names. The request is camelCase and Postgres is
  // snake_case, and writing the request keys straight through produced a 400
  // from PostgREST on every call — caught by running contract 10 against real
  // Postgres rather than the in-process dev store.
  const COLUMNS: Record<(typeof ALLOWED_FIELDS)[number], string> = {
    boardsStarted: 'boards_started',
    boardsCompleted: 'boards_completed',
    hintsUsed: 'hints_used',
    totalSeconds: 'total_seconds',
    appVersion: 'app_version',
    anonymousSessionId: 'anonymous_session_id',
  };

  const row: Record<string, unknown> = { recorded_at: now };
  for (const field of ALLOWED_FIELDS) row[COLUMNS[field]] = request[field];

  await ports.store.recordSession(row);

  return ok<SessionAnalyticsResponse>(
    CONTRACT,
    CONTRACT_VERSION,
    { stored: true, reason: null },
    { now, state: 'configured' },
  );
}
