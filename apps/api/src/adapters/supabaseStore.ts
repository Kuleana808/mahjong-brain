/**
 * Supabase-backed store, over PostgREST.
 *
 * Plain `fetch` rather than `@supabase/supabase-js`, for two reasons: this file
 * has to run unchanged inside a Supabase Edge Function, and the SDK is a large
 * dependency for what amounts to six queries.
 *
 * Uses the service-role key, so it bypasses row-level security. That is
 * appropriate here — the server is the thing enforcing "an account only sees
 * its own row", and it does that by only ever querying by an `accountId` that
 * came out of a *verified* session token. RLS is still enabled in the schema as
 * a second line of defence for anything that ever talks to Postgres with an
 * anon key.
 *
 * The service-role key must never reach a client. It is server-side only.
 */

import type {
  AccountRecord,
  DailyRewardRecord,
  StorePort,
  SyncedSettings,
  UnlockRecord,
} from '@mahjong-brain/core/contracts';

export interface SupabaseStoreOptions {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

interface AccountRow {
  id: string;
  apple_subject: string;
  created_at: string;
}

interface SettingsRow {
  account_id: string;
  settings: SyncedSettings;
  revision: number;
  updated_at: string;
}

interface UnlockRow {
  account_id: string;
  product_id: string;
  original_transaction_id: string;
  purchased_at: string;
  environment: string;
  revoked: boolean;
  source: UnlockRecord['source'];
  verified_at: string;
}

export function createSupabaseStore(options: SupabaseStoreOptions): StorePort {
  if (!options.url || !options.serviceRoleKey) {
    throw new Error('createSupabaseStore: url and serviceRoleKey are required');
  }

  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const base = `${options.url.replace(/\/$/, '')}/rest/v1`;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await doFetch(`${base}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        apikey: options.serviceRoleKey,
        authorization: `Bearer ${options.serviceRoleKey}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });

    if (!response.ok) {
      // The body can echo the query, which can contain an account id. Keep it
      // out of the thrown message; the status is enough to act on.
      throw new Error(`Supabase ${init.method ?? 'GET'} ${path} failed with ${response.status}`);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const encode = encodeURIComponent;

  return {
    async findAccountByAppleSubject(subject): Promise<AccountRecord | null> {
      const rows = await request<AccountRow[]>(
        `/accounts?apple_subject=eq.${encode(subject)}&select=id,apple_subject,created_at&limit=1`,
      );
      const row = rows[0];
      return row
        ? { accountId: row.id, appleSubject: row.apple_subject, createdAt: row.created_at }
        : null;
    },

    async createAccount(subject): Promise<AccountRecord> {
      const rows = await request<AccountRow[]>('/accounts', {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({ apple_subject: subject }),
      });
      const row = rows[0];
      if (!row) throw new Error('Supabase did not return the created account');
      return { accountId: row.id, appleSubject: row.apple_subject, createdAt: row.created_at };
    },

    async getSettings(accountId) {
      const rows = await request<SettingsRow[]>(
        `/settings?account_id=eq.${encode(accountId)}&select=settings,revision,updated_at&limit=1`,
      );
      const row = rows[0];
      return row
        ? { settings: row.settings, revision: row.revision, updatedAt: row.updated_at }
        : null;
    },

    async putSettings(accountId, settings, revision) {
      const rows = await request<SettingsRow[]>('/settings', {
        method: 'POST',
        headers: {
          prefer: 'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify({
          account_id: accountId,
          settings,
          revision,
          updated_at: new Date().toISOString(),
        }),
      });
      const row = rows[0];
      if (!row) throw new Error('Supabase did not return the written settings');
      return { settings: row.settings, revision: row.revision, updatedAt: row.updated_at };
    },

    async getUnlock(accountId): Promise<UnlockRecord | null> {
      const rows = await request<UnlockRow[]>(
        `/unlocks?account_id=eq.${encode(accountId)}&select=*&limit=1`,
      );
      const row = rows[0];
      return row
        ? {
            accountId: row.account_id,
            productId: row.product_id,
            originalTransactionId: row.original_transaction_id,
            purchasedAt: row.purchased_at,
            environment: row.environment,
            revoked: row.revoked,
            source: row.source,
            verifiedAt: row.verified_at,
          }
        : null;
    },

    async putUnlock(record) {
      await request<void>('/unlocks', {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          account_id: record.accountId,
          product_id: record.productId,
          original_transaction_id: record.originalTransactionId,
          purchased_at: record.purchasedAt,
          environment: record.environment,
          revoked: record.revoked,
          source: record.source,
          verified_at: record.verifiedAt,
        }),
      });
    },

    async recordSession(row) {
      await request<void>('/session_analytics', {
        method: 'POST',
        body: JSON.stringify(row),
      });
    },

    async recordEvents(rows) {
      if (rows.length === 0) return;
      // One insert for the whole batch: an offline queue can arrive 500 deep,
      // and 500 round trips would be a self-inflicted outage.
      await request<void>('/events', { method: 'POST', body: JSON.stringify(rows) });
    },

    async getDailyReward(accountId): Promise<DailyRewardRecord | null> {
      const rows = await request<{ last_claimed_on: string | null; streak_days: number }[]>(
        `/daily_rewards?account_id=eq.${encode(accountId)}&select=last_claimed_on,streak_days&limit=1`,
      );
      const row = rows[0];
      return row ? { lastClaimedOn: row.last_claimed_on, streakDays: row.streak_days } : null;
    },

    async putDailyReward(accountId, record) {
      await request<void>('/daily_rewards', {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          account_id: accountId,
          last_claimed_on: record.lastClaimedOn,
          streak_days: record.streakDays,
        }),
      });
    },
  };
}
