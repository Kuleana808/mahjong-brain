/**
 * Contract 12 — daily reward and streak.
 *
 * A parity loop (D-014). The earlier spec ruled this out explicitly — "no
 * timers, no streaks, no come-back-tomorrow" — and that ruling is retired.
 *
 * Two details that are easy to get wrong and expensive to fix later:
 *
 * **The day boundary is the player's, not the server's.** A daily reward keyed
 * to UTC rolls over at 2pm in Hawai'i, which means a player claiming after
 * lunch gets two rewards and a player claiming in the evening loses a streak
 * they did not break. The client sends its local date and the server keys on
 * that. It is spoofable — a player can change their clock and claim twice —
 * and that is the right trade for a single-player game with no economy to
 * inflate. Revisit only if a reward ever becomes worth money.
 *
 * **A streak breaks on a missed day, not a missed session.** Playing twice on
 * Tuesday and not at all on Wednesday breaks it; playing once on each of
 * Tuesday and Wednesday does not.
 */

import { fail, notConfigured, ok, type ContractEnvelope } from '../envelope';
import { nowOf, type Ports } from '../ports';
import {
  CONTRACT_VERSION,
  type DailyClaimRequest,
  type DailyClaimResponse,
  type DailyRewardState,
  type GrantKind,
} from '../types';

const CONTRACT = 'api/retention/daily';

/**
 * The seven-day cycle, then it repeats.
 *
 * Front-loaded with the cheap consumables and paying out the ad-free day at the
 * end, which is the shape the incumbent's ladder takes.
 */
const CYCLE: readonly { kind: GrantKind; quantity: number }[] = [
  { kind: 'hint', quantity: 1 },
  { kind: 'shuffle', quantity: 1 },
  { kind: 'hint', quantity: 2 },
  { kind: 'revive', quantity: 1 },
  { kind: 'shuffle', quantity: 2 },
  { kind: 'hint', quantity: 3 },
  { kind: 'revive', quantity: 3 },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Whole days between two `YYYY-MM-DD` strings. Calendar days, not 24h spans. */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

function stateFor(
  localDate: string,
  record: { lastClaimedOn: string | null; streakDays: number } | null,
): DailyRewardState {
  const last = record?.lastClaimedOn ?? null;
  const gap = last ? daysBetween(last, localDate) : null;

  // gap 0 → already claimed today. gap 1 → consecutive. gap > 1 → broken.
  const streakBroken = gap !== null && gap > 1;
  const claimableToday = gap === null || gap >= 1;
  const streakDays = gap === null || streakBroken ? 0 : (record?.streakDays ?? 0);

  const nextStreak = claimableToday ? streakDays + 1 : streakDays;
  const day = ((nextStreak - 1) % CYCLE.length) + 1;

  return {
    day: Math.max(1, day),
    streakDays: claimableToday ? streakDays : (record?.streakDays ?? 0),
    claimableToday,
    reward: CYCLE[Math.max(0, day - 1)],
    lastClaimedOn: last,
    streakBroken,
  };
}

async function gate(
  sessionToken: string | null,
  ports: Ports,
): Promise<{ accountId: string } | ContractEnvelope<never>> {
  const now = nowOf(ports);
  const missing: string[] = [];
  if (!ports.store) missing.push('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  if (!ports.session) missing.push('SESSION_SIGNING_KEY');
  if (missing.length > 0) return notConfigured(CONTRACT, CONTRACT_VERSION, missing, { now });

  const accountId = await ports.session!.verify(sessionToken);
  if (!accountId) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'unauthenticated',
      message: 'Sign in to keep your streak across devices.',
    }, { now, state: 'configured' });
  }
  return { accountId };
}

export async function getDailyReward(
  sessionToken: string | null,
  localDate: string,
  ports: Ports = {},
): Promise<ContractEnvelope<DailyRewardState>> {
  const now = nowOf(ports);

  if (!DATE_PATTERN.test(localDate ?? '')) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'localDate must be YYYY-MM-DD.',
      field: 'localDate',
    }, { now });
  }

  const account = await gate(sessionToken, ports);
  if ('contract' in account) return account;

  const record = await ports.store!.getDailyReward(account.accountId);
  return ok(CONTRACT, CONTRACT_VERSION, stateFor(localDate, record), {
    now,
    state: 'configured',
  });
}

export async function claimDailyReward(
  sessionToken: string | null,
  request: DailyClaimRequest,
  ports: Ports = {},
): Promise<ContractEnvelope<DailyClaimResponse>> {
  const now = nowOf(ports);
  const localDate = request?.localDate;

  if (!DATE_PATTERN.test(localDate ?? '')) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'localDate must be YYYY-MM-DD.',
      field: 'localDate',
    }, { now });
  }

  const account = await gate(sessionToken, ports);
  if ('contract' in account) return account;

  const record = await ports.store!.getDailyReward(account.accountId);
  const state = stateFor(localDate, record);

  if (!state.claimableToday) {
    // Idempotent: a double tap, or a retry after a dropped response, returns
    // the same state and grants nothing rather than paying out twice.
    return ok<DailyClaimResponse>(
      CONTRACT,
      CONTRACT_VERSION,
      { ...state, granted: null },
      {
        now,
        state: 'configured',
        fallbackReason: 'Already claimed today; nothing was granted.',
      },
    );
  }

  const streakDays = state.streakDays + 1;
  await ports.store!.putDailyReward(account.accountId, {
    lastClaimedOn: localDate,
    streakDays,
  });

  return ok<DailyClaimResponse>(
    CONTRACT,
    CONTRACT_VERSION,
    {
      ...state,
      streakDays,
      claimableToday: false,
      lastClaimedOn: localDate,
      granted: state.reward,
    },
    { now, state: 'configured' },
  );
}
