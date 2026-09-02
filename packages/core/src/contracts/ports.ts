/**
 * What the handlers need from the outside world.
 *
 * The handlers themselves are pure functions of (request, ports). Supabase,
 * Apple, and the clock all arrive through here, which is what lets every
 * contract be tested without a network and swapped without a rewrite.
 *
 * Ports are optional. A handler with a missing port answers `source_available`
 * with a `fallback_reason` naming what is absent — it never invents a result.
 */

import type { SyncedSettings } from './types';

export interface AccountRecord {
  readonly accountId: string;
  /** Apple's stable `sub`. Never logged, never returned to a client. */
  readonly appleSubject: string;
  readonly createdAt: string;
}

export interface UnlockRecord {
  readonly accountId: string;
  readonly productId: string;
  readonly originalTransactionId: string;
  readonly purchasedAt: string;
  readonly environment: string;
  readonly revoked: boolean;
  readonly source: 'verified_transaction' | 'app_store_notification';
  readonly verifiedAt: string;
}

/** Persistence. Supabase Postgres in production. */
export interface StorePort {
  findAccountByAppleSubject(subject: string): Promise<AccountRecord | null>;
  createAccount(subject: string): Promise<AccountRecord>;

  getSettings(accountId: string): Promise<{ settings: SyncedSettings; revision: number; updatedAt: string } | null>;
  putSettings(
    accountId: string,
    settings: SyncedSettings,
    revision: number,
  ): Promise<{ settings: SyncedSettings; revision: number; updatedAt: string }>;

  getUnlock(accountId: string): Promise<UnlockRecord | null>;
  putUnlock(record: UnlockRecord): Promise<void>;

  /** Opt-in only. Called solely when the request carried `consent: true`. */
  recordSession(row: Record<string, unknown>): Promise<void>;

  /**
   * Product analytics (contract 11). Rows are pre-sanitised by the handler and
   * carry no account id — see the privacy note in handlers/telemetry.ts.
   */
  recordEvents(rows: readonly Record<string, unknown>[]): Promise<void>;

  getDailyReward(accountId: string): Promise<DailyRewardRecord | null>;
  putDailyReward(accountId: string, record: DailyRewardRecord): Promise<void>;
  getConsumableGrant(transactionId: string): Promise<ConsumableGrantRecord | null>;
  /** Atomically inserts once by transaction id. False means it already existed. */
  putConsumableGrant(record: ConsumableGrantRecord): Promise<boolean>;
}

export interface DailyRewardRecord {
  /** ISO date, the player's local day. Never a timestamp. */
  readonly lastClaimedOn: string | null;
  readonly streakDays: number;
}

export interface ConsumableGrantRecord {
  readonly accountId: string;
  readonly transactionId: string;
  readonly productId: string;
  readonly kind: 'shuffle';
  readonly quantity: number;
  readonly purchasedAt: string;
  readonly environment: string;
  readonly grantedAt: string;
}

export interface SessionPort {
  /** Mint an app session token for an account. */
  issue(accountId: string): Promise<{ token: string; expiresAt: string }>;
  /** Returns the account id, or null when the token is absent or invalid. */
  verify(token: string | null): Promise<string | null>;
}

export interface VerifiedAppleIdentity {
  readonly subject: string;
  readonly email: string | null;
}

export interface AppleIdentityPort {
  /** Throws on any verification failure. Never returns a partially-checked result. */
  verifyIdentityToken(token: string): Promise<VerifiedAppleIdentity>;
}

export interface VerifiedTransaction {
  readonly productId: string;
  /** Individual StoreKit transaction. Consumable idempotency keys on this. */
  readonly transactionId: string;
  readonly originalTransactionId: string;
  readonly purchasedAt: string;
  readonly environment: string;
  readonly revoked: boolean;
}

export interface StoreKitPort {
  /** Throws on any verification failure. */
  verifySignedTransaction(jws: string): Promise<VerifiedTransaction>;
}

export interface Ports {
  readonly store?: StorePort;
  readonly session?: SessionPort;
  readonly apple?: AppleIdentityPort;
  readonly storekit?: StoreKitPort;
  /** Injected so handlers stay deterministic under test. */
  readonly now?: () => string;
  /** Injected so seeds are reproducible under test. */
  readonly randomSeed?: () => number;
}

export const nowOf = (ports: Ports): string => (ports.now ?? (() => new Date().toISOString()))();
