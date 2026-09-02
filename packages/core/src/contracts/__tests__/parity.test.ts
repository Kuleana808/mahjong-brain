/**
 * Contracts 11 and 12 — instrumentation and the daily reward loop.
 *
 * Both arrived with the parity doctrine (D-014). The tests that matter are the
 * ones protecting the two properties that are easy to lose later: events cannot
 * carry anything identifying, and a daily reward cannot be claimed twice.
 */

import { describe, expect, it } from 'vitest';

import { claimDailyReward, getDailyReward } from '../handlers/retention';
import { ingestEvents } from '../handlers/telemetry';
import { EVENT_NAMES, MAX_EVENTS_PER_BATCH, type EventBatch } from '../../telemetry/events';
import type { DailyRewardRecord, Ports, StorePort } from '../ports';
import type { SyncedSettings } from '../types';

const NOW = '2026-08-09T12:00:00.000Z';

function stubStore(): StorePort & { rows: Record<string, unknown>[]; daily: Map<string, DailyRewardRecord> } {
  const rows: Record<string, unknown>[] = [];
  const daily = new Map<string, DailyRewardRecord>();
  const settings = new Map<string, { settings: SyncedSettings; revision: number; updatedAt: string }>();

  return {
    rows,
    daily,
    async findAccountByAppleSubject() {
      return null;
    },
    async createAccount(subject) {
      return { accountId: 'acct_1', appleSubject: subject, createdAt: NOW };
    },
    async getSettings(id) {
      return settings.get(id) ?? null;
    },
    async putSettings(id, next, revision) {
      const row = { settings: next, revision, updatedAt: NOW };
      settings.set(id, row);
      return row;
    },
    async getUnlock() {
      return null;
    },
    async putUnlock() {},
    async recordSession() {},
    async recordEvents(incoming) {
      rows.push(...incoming);
    },
    async getDailyReward(id) {
      return daily.get(id) ?? null;
    },
    async putDailyReward(id, record) {
      daily.set(id, record);
    },
    async getConsumableGrant() { return null; },
    async putConsumableGrant() { return true; },
  };
}

function portsWith(store: StorePort): Ports {
  return {
    now: () => NOW,
    store,
    session: {
      async issue() {
        return { token: 'token', expiresAt: NOW };
      },
      async verify(token) {
        return token === 'token' ? 'acct_1' : null;
      },
    },
  };
}

const batch = (over: Partial<EventBatch> = {}): EventBatch => ({
  schemaVersion: 1,
  anonymousDeviceId: 'rotating-abcdef12',
  sessionId: 'sess-1',
  appVersion: '0.1.0',
  platform: 'ios',
  events: [{ name: 'app_open', at: NOW, sequence: 0 }],
  ...over,
});

// --------------------------------------------------------------- contract 11

describe('event ingestion', () => {
  it('stores an accepted batch', async () => {
    const store = stubStore();
    const { envelope } = { envelope: await ingestEvents(batch(), portsWith(store)) };

    expect(envelope.data!.accepted).toBe(1);
    expect(envelope.data!.rejected).toEqual([]);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].name).toBe('app_open');
  });

  it('covers the whole funnel the doctrine asks for', () => {
    // Onboarding, core loop, every revenue hook, and the retention loops. If a
    // funnel step has no event, it cannot be measured, and the doctrine says no
    // feature ships without a metric.
    for (const required of [
      'age_gate_shown',
      'tos_accepted',
      'loading_quote_shown',
      'tutorial_step_shown',
      'tutorial_first_pair_cleared',
      'tile_tap',
      'holder_slot_filled',
      'holder_full',
      'revive_offered',
      'revive_ad_completed',
      'hint_ad_completed',
      'shuffle_iap_purchased',
      'iap_purchase_completed',
      'daily_reward_claimed',
      'streak_advanced',
      'session_end',
    ]) {
      expect(EVENT_NAMES).toContain(required);
    }
  });

  it('rejects an unknown event without discarding the rest of the batch', async () => {
    const store = stubStore();
    const envelope = await ingestEvents(
      batch({
        events: [
          { name: 'app_open', at: NOW, sequence: 0 },
          { name: 'not_a_real_event' as never, at: NOW, sequence: 1 },
          { name: 'session_end', at: NOW, sequence: 2 },
        ],
      }),
      portsWith(store),
    );

    expect(envelope.data!.accepted).toBe(2);
    expect(envelope.data!.rejected).toHaveLength(1);
    expect(envelope.data!.rejected[0].index).toBe(1);
    // A partially-accepted batch is a client bug and must not be silent.
    expect(envelope.fallback_reason).toMatch(/1 of 3/);
    expect(store.rows).toHaveLength(2);
  });

  it('drops any property that is not on the allow-list', async () => {
    const store = stubStore();
    await ingestEvents(
      batch({
        events: [
          {
            name: 'tile_tap',
            at: NOW,
            sequence: 0,
            properties: {
              holderCount: 2,
              // Things a careless client might attach. None may be stored.
              idfa: 'ABCDEF-123456',
              appleUserId: '000123.abc',
              email: 'someone@example.com',
            } as never,
          },
        ],
      }),
      portsWith(store),
    );

    const stored = JSON.stringify(store.rows[0]);
    expect(store.rows[0].properties).toEqual({ holderCount: 2 });
    expect(stored).not.toMatch(/ABCDEF/);
    expect(stored).not.toMatch(/000123/);
    expect(stored).not.toMatch(/example\.com/);
  });

  it('never stores an account id, even with a session present', async () => {
    const store = stubStore();
    await ingestEvents(batch(), portsWith(store));
    // Contract 11 takes no session token at all, and the row has no slot for one.
    expect(Object.keys(store.rows[0])).not.toContain('account_id');
    expect(JSON.stringify(store.rows[0])).not.toMatch(/acct_/);
  });

  it('refuses a device id short enough to be a constant', async () => {
    const envelope = await ingestEvents(
      batch({ anonymousDeviceId: 'x' }),
      portsWith(stubStore()),
    );
    expect(envelope.error?.code).toBe('invalid_request');
    expect(envelope.error?.field).toBe('anonymousDeviceId');
  });

  it('refuses an oversized batch rather than truncating it silently', async () => {
    const events = Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, (_, i) => ({
      name: 'tile_tap' as const,
      at: NOW,
      sequence: i,
    }));
    const envelope = await ingestEvents(batch({ events }), portsWith(stubStore()));
    expect(envelope.error?.code).toBe('invalid_request');
  });

  it('says so rather than pretending when there is nowhere to store events', async () => {
    const envelope = await ingestEvents(batch(), { now: () => NOW });
    expect(envelope.error?.code).toBe('not_configured');
    expect(envelope.state).toBe('source_available');
  });
});

// --------------------------------------------------------------- contract 12

describe('daily reward', () => {
  it('is claimable on a first ever visit', async () => {
    const envelope = await getDailyReward('token', '2026-08-09', portsWith(stubStore()));
    expect(envelope.data!.claimableToday).toBe(true);
    expect(envelope.data!.day).toBe(1);
    expect(envelope.data!.streakDays).toBe(0);
  });

  it('grants, then refuses a second claim on the same day', async () => {
    const ports = portsWith(stubStore());

    const first = await claimDailyReward('token', { localDate: '2026-08-09' }, ports);
    expect(first.data!.granted).not.toBeNull();
    expect(first.data!.streakDays).toBe(1);

    const second = await claimDailyReward('token', { localDate: '2026-08-09' }, ports);
    expect(second.data!.granted).toBeNull();
    expect(second.data!.streakDays).toBe(1);
    expect(second.fallback_reason).toMatch(/already claimed/i);
  });

  it('advances the streak on consecutive days', async () => {
    const ports = portsWith(stubStore());
    await claimDailyReward('token', { localDate: '2026-08-09' }, ports);
    const second = await claimDailyReward('token', { localDate: '2026-08-10' }, ports);
    expect(second.data!.streakDays).toBe(2);
    expect(second.data!.day).toBe(2);
  });

  it('breaks the streak on a missed day', async () => {
    const ports = portsWith(stubStore());
    await claimDailyReward('token', { localDate: '2026-08-09' }, ports);
    await claimDailyReward('token', { localDate: '2026-08-10' }, ports);

    const afterGap = await getDailyReward('token', '2026-08-13', ports);
    expect(afterGap.data!.streakBroken).toBe(true);

    const claimed = await claimDailyReward('token', { localDate: '2026-08-13' }, ports);
    expect(claimed.data!.streakDays).toBe(1);
  });

  it('cycles the ladder over seven days and starts again', async () => {
    const ports = portsWith(stubStore());
    const days = Array.from({ length: 8 }, (_, i) => `2026-08-${String(9 + i).padStart(2, '0')}`);

    const seen: number[] = [];
    for (const date of days) {
      const claimed = await claimDailyReward('token', { localDate: date }, ports);
      seen.push(claimed.data!.day);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 1]);
  });

  it('keys on the player local date, not the server clock', async () => {
    // The server `now` is fixed at 2026-08-09 throughout; a player in a later
    // local day must still be able to claim. A UTC-keyed reward would roll over
    // mid-afternoon in Hawai'i.
    const ports = portsWith(stubStore());
    await claimDailyReward('token', { localDate: '2026-08-09' }, ports);
    const nextDay = await claimDailyReward('token', { localDate: '2026-08-10' }, ports);
    expect(nextDay.data!.granted).not.toBeNull();
  });

  it('refuses a malformed date rather than guessing', async () => {
    const envelope = await claimDailyReward('token', { localDate: '9 Aug 2026' }, portsWith(stubStore()));
    expect(envelope.error?.code).toBe('invalid_request');
    expect(envelope.error?.field).toBe('localDate');
  });

  it('needs a session, because a streak belongs to an account', async () => {
    const envelope = await getDailyReward(null, '2026-08-09', portsWith(stubStore()));
    expect(envelope.error?.code).toBe('unauthenticated');
    expect(envelope.state).toBe('configured');
  });
});
