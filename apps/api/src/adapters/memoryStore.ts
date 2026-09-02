/**
 * In-process store, for local development.
 *
 * This exists so Codex can build the sign-in, settings-sync and paywall UI
 * against endpoints that actually work, today, without waiting on a Supabase
 * project or on D-001. Same `StorePort`, same handlers, same envelopes — the
 * only difference is where the rows live.
 *
 * Optionally persists to a JSON file so a restart does not wipe the state you
 * were mid-test on. Never used in production: `createPorts` only reaches for
 * this when `MAHJONG_BRAIN_DEV_STORE=memory` is set explicitly.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import type {
  AccountRecord,
  DailyRewardRecord,
  ConsumableGrantRecord,
  StorePort,
  SyncedSettings,
  UnlockRecord,
} from '@mahjong-brain/core/contracts';

interface Snapshot {
  accounts: AccountRecord[];
  settings: Record<string, { settings: SyncedSettings; revision: number; updatedAt: string }>;
  unlocks: Record<string, UnlockRecord>;
  sessions: Record<string, unknown>[];
  events: Record<string, unknown>[];
  daily: Record<string, DailyRewardRecord>;
  consumables: Record<string, ConsumableGrantRecord>;
}

const empty = (): Snapshot => ({
  accounts: [],
  settings: {},
  unlocks: {},
  sessions: [],
  events: [],
  daily: {},
  consumables: {},
});

export interface MemoryStoreOptions {
  /** Where to persist between restarts. Omit to keep everything in memory. */
  readonly file?: string;
  readonly now?: () => string;
}

export function createMemoryStore(options: MemoryStoreOptions = {}): StorePort {
  const now = options.now ?? (() => new Date().toISOString());
  let data: Snapshot = empty();

  if (options.file) {
    try {
      data = { ...empty(), ...JSON.parse(readFileSync(options.file, 'utf8')) };
    } catch {
      // No file yet, or an unreadable one. Starting clean is the right move for
      // a dev store; there is nothing here worth recovering.
    }
  }

  const flush = () => {
    if (!options.file) return;
    try {
      writeFileSync(options.file, JSON.stringify(data, null, 2));
    } catch {
      // Dev convenience only — never fail a request because a scratch file
      // could not be written.
    }
  };

  return {
    async findAccountByAppleSubject(subject) {
      return data.accounts.find((a) => a.appleSubject === subject) ?? null;
    },

    async createAccount(subject) {
      const account: AccountRecord = {
        accountId: `acct_${crypto.randomUUID()}`,
        appleSubject: subject,
        createdAt: now(),
      };
      data.accounts.push(account);
      flush();
      return account;
    },

    async getSettings(accountId) {
      return data.settings[accountId] ?? null;
    },

    async putSettings(accountId, settings, revision) {
      const row = { settings, revision, updatedAt: now() };
      data.settings[accountId] = row;
      flush();
      return row;
    },

    async getUnlock(accountId) {
      return data.unlocks[accountId] ?? null;
    },

    async putUnlock(record) {
      data.unlocks[record.accountId] = record;
      flush();
    },

    async recordSession(row) {
      data.sessions.push(row);
      flush();
    },

    async recordEvents(rows) {
      data.events.push(...rows);
      // A dev store should not grow without bound during a long session.
      if (data.events.length > 5000) data.events.splice(0, data.events.length - 5000);
      flush();
    },

    async getDailyReward(accountId) {
      return data.daily[accountId] ?? null;
    },

    async putDailyReward(accountId, record) {
      data.daily[accountId] = record;
      flush();
    },

    async getConsumableGrant(transactionId) {
      return data.consumables[transactionId] ?? null;
    },

    async putConsumableGrant(record) {
      if (data.consumables[record.transactionId]) return false;
      data.consumables[record.transactionId] = record;
      flush();
      return true;
    },
  };
}
