/**
 * The five infrastructure-backed contracts, end to end through the router.
 *
 * PR #2 could only prove that 3, 4, 8, 9 and 10 fail honestly when
 * unconfigured. This proves the other half: given real adapters, they do the
 * thing. Sign in with a real Apple-shaped token, sync settings, verify a real
 * StoreKit-shaped transaction, and see the unlock follow the account.
 *
 * Everything is signed with keys generated in the test, so this runs offline
 * and there is no mocked verifier anywhere in the path.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { Ports } from '@mahjong-brain/core/contracts';

import { createAppleIdentityPort } from '../adapters/appleIdentity';
import { createMemoryStore } from '../adapters/memoryStore';
import { createSessionPort } from '../adapters/session';
import { createStoreKitPort } from '../adapters/storekit';
import {
  generateEcKeyPair,
  generateRsaKeyPair,
  makeCertificate,
  publicJwk,
  signEs256,
  signRs256,
  type TestCert,
} from '../adapters/__tests__/testCerts';
import { handle, type ApiRequest } from '../router';

const BUNDLE_ID = 'com.mahjongbrain.game';
const PRODUCT_ID = 'com.mahjongbrain.game.removeads';
const NOW_MS = Date.UTC(2026, 7, 9, 12, 0, 0);

let ports: Ports;
let appleKeys: CryptoKeyPair;
let leafKeys: CryptoKeyPair;
let chain: string[];
let root: TestCert;

beforeAll(async () => {
  appleKeys = await generateRsaKeyPair();
  const jwks = { keys: [await publicJwk(appleKeys, 'kid-1')] };

  const rootKeys = await generateEcKeyPair();
  const intermediateKeys = await generateEcKeyPair();
  leafKeys = await generateEcKeyPair();
  root = await makeCertificate(rootKeys, rootKeys, 1);
  const intermediate = await makeCertificate(intermediateKeys, rootKeys, 2);
  const leaf = await makeCertificate(leafKeys, intermediateKeys, 3);
  chain = [leaf.base64, intermediate.base64, root.base64];

  ports = {
    now: () => new Date(NOW_MS).toISOString(),
    store: createMemoryStore(),
    session: createSessionPort({ signingKey: 'k'.repeat(48), now: () => NOW_MS }),
    apple: createAppleIdentityPort({
      bundleId: BUNDLE_ID,
      now: () => NOW_MS,
      fetchImpl: (async () => new Response(JSON.stringify(jwks), { status: 200 })) as typeof fetch,
    }),
    storekit: createStoreKitPort({
      appleRootCaG3Base64: root.base64,
      expectedProductIds: [PRODUCT_ID],
      expectedBundleId: BUNDLE_ID,
      now: () => NOW_MS,
    }),
  };
});

const call = (
  method: string,
  path: string,
  options: { body?: unknown; bearer?: string | null; query?: string } = {},
) =>
  handle(
    {
      method,
      path,
      query: new URLSearchParams(options.query ?? ''),
      body: options.body,
      bearer: options.bearer ?? null,
    } satisfies ApiRequest,
    ports,
  );

async function identityToken(subject = '000123.abc.0001'): Promise<string> {
  return signRs256(
    {
      iss: 'https://appleid.apple.com',
      aud: BUNDLE_ID,
      sub: subject,
      exp: Math.floor(NOW_MS / 1000) + 600,
    },
    appleKeys,
    'kid-1',
  );
}

async function signIn(subject?: string): Promise<{ token: string; accountId: string; created: boolean }> {
  const { envelope } = await call('POST', '/api/auth/apple-id', {
    body: { identityToken: await identityToken(subject) },
  });
  const data = envelope.data as { sessionToken: string; accountId: string; created: boolean };
  return { token: data.sessionToken, accountId: data.accountId, created: data.created };
}

// --------------------------------------------------------------- contract 3 --

describe('contract 3 — sign in with Apple', () => {
  it('creates an account on first sign-in and reuses it after', async () => {
    const first = await signIn('sub-new');
    expect(first.created).toBe(true);

    const second = await signIn('sub-new');
    expect(second.created).toBe(false);
    expect(second.accountId).toBe(first.accountId);
  });

  it('reports state configured, not live_verified, until it has run against Apple', async () => {
    const { envelope } = await call('POST', '/api/auth/apple-id', {
      body: { identityToken: await identityToken('sub-state') },
    });
    expect(envelope.state).toBe('configured');
    expect(envelope.error).toBeNull();
  });

  it('refuses a token for another app with a message that gives nothing away', async () => {
    const token = await signRs256(
      {
        iss: 'https://appleid.apple.com',
        aud: 'com.someone.else',
        sub: 'sub-x',
        exp: Math.floor(NOW_MS / 1000) + 600,
      },
      appleKeys,
      'kid-1',
    );
    const { status, envelope } = await call('POST', '/api/auth/apple-id', {
      body: { identityToken: token },
    });

    expect(status).toBe(401);
    expect(envelope.error?.code).toBe('unauthenticated');
    // Player-safe message; the detail stays in fallback_reason for us.
    expect(envelope.error?.message).toBe('That sign-in could not be verified.');
    expect(envelope.fallback_reason).toMatch(/audience/i);
  });

  it('refuses when userIdentifier disagrees with the token subject', async () => {
    const { envelope } = await call('POST', '/api/auth/apple-id', {
      body: { identityToken: await identityToken('sub-a'), userIdentifier: 'sub-b' },
    });
    expect(envelope.error?.code).toBe('unauthenticated');
    expect(envelope.fallback_reason).toMatch(/userIdentifier/);
  });
});

// --------------------------------------------------------------- contract 4 --

describe('contract 4 — settings sync', () => {
  it('round-trips settings for a signed-in account', async () => {
    const { token } = await signIn('sub-settings');

    const before = await call('GET', '/api/settings', { bearer: token });
    expect((before.envelope.data as { revision: number }).revision).toBe(0);

    const written = await call('PATCH', '/api/settings', {
      bearer: token,
      body: { fontScale: 1.45, theme: 'high-contrast', sounds: false },
    });
    const data = written.envelope.data as { settings: Record<string, unknown>; revision: number };
    expect(data.settings.fontScale).toBe(1.45);
    expect(data.settings.sounds).toBe(false);
    expect(data.revision).toBe(1);

    const after = await call('GET', '/api/settings', { bearer: token });
    expect((after.envelope.data as { settings: Record<string, unknown> }).settings.theme).toBe(
      'high-contrast',
    );
  });

  it('keeps one account out of another account’s settings', async () => {
    const a = await signIn('sub-a1');
    const b = await signIn('sub-b1');

    await call('PATCH', '/api/settings', { bearer: a.token, body: { fontScale: 1.45 } });
    const theirs = await call('GET', '/api/settings', { bearer: b.token });

    expect((theirs.envelope.data as { settings: { fontScale: number } }).settings.fontScale).toBe(1);
  });

  it('rejects a forged session token', async () => {
    const { status, envelope } = await call('GET', '/api/settings', {
      bearer: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhY2N0X2FkbWluIn0.forged',
    });
    expect(status).toBe(401);
    expect(envelope.error?.code).toBe('unauthenticated');
  });
});

// ----------------------------------------------------- contracts 8 and 9 --

describe('contracts 8 and 9 — purchase and unlock status', () => {
  const transaction = (over: Record<string, unknown> = {}) => ({
    bundleId: BUNDLE_ID,
    productId: PRODUCT_ID,
    transactionId: `3000000000000${Math.floor(Math.random() * 900 + 100)}`,
    originalTransactionId: `2000000000000${Math.floor(Math.random() * 900 + 100)}`,
    originalPurchaseDate: NOW_MS - 86_400_000,
    environment: 'Sandbox',
    ...over,
  });

  it('unlocks on a verified transaction and reports it back on unlock-status', async () => {
    const { token } = await signIn('sub-buyer');

    const before = await call('GET', '/api/unlock-status', { bearer: token });
    expect((before.envelope.data as { unlocked: boolean }).unlocked).toBe(false);

    const jws = await signEs256(transaction(), leafKeys, chain);
    const validated = await call('POST', '/api/receipts/validate', {
      bearer: token,
      body: { signedTransaction: jws },
    });
    expect((validated.envelope.data as { unlocked: boolean }).unlocked).toBe(true);

    const after = await call('GET', '/api/unlock-status', { bearer: token });
    const status = after.envelope.data as { unlocked: boolean; source: string };
    expect(status.unlocked).toBe(true);
    expect(status.source).toBe('verified_transaction');
  });

  it('a refund takes the unlock away again', async () => {
    const { token } = await signIn('sub-refunded');

    const original = transaction();
    await call('POST', '/api/receipts/validate', {
      bearer: token,
      body: { signedTransaction: await signEs256(original, leafKeys, chain) },
    });
    expect(
      ((await call('GET', '/api/unlock-status', { bearer: token })).envelope.data as {
        unlocked: boolean;
      }).unlocked,
    ).toBe(true);

    const revoked = await signEs256(
      { ...original, revocationDate: NOW_MS - 1000, revocationReason: 1 },
      leafKeys,
      chain,
    );
    const result = await call('POST', '/api/receipts/validate', {
      bearer: token,
      body: { signedTransaction: revoked },
    });
    expect((result.envelope.data as { unlocked: boolean }).unlocked).toBe(false);
    expect(result.envelope.fallback_reason).toMatch(/revoked/i);

    const after = await call('GET', '/api/unlock-status', { bearer: token });
    expect((after.envelope.data as { unlocked: boolean }).unlocked).toBe(false);
  });

  it('an attacker-signed transaction never unlocks anything', async () => {
    const { token } = await signIn('sub-attacker');

    const evilRootKeys = await generateEcKeyPair();
    const evilLeafKeys = await generateEcKeyPair();
    const evilRoot = await makeCertificate(evilRootKeys, evilRootKeys, 90);
    const evilLeaf = await makeCertificate(evilLeafKeys, evilRootKeys, 91);

    const jws = await signEs256(transaction(), evilLeafKeys, [evilLeaf.base64, evilRoot.base64]);
    const result = await call('POST', '/api/receipts/validate', {
      bearer: token,
      body: { signedTransaction: jws },
    });

    expect(result.envelope.data).toBeNull();
    expect(result.envelope.error?.code).toBe('unverified_transaction');
    expect(JSON.stringify(result.envelope)).not.toMatch(/"unlocked":true/);

    const after = await call('GET', '/api/unlock-status', { bearer: token });
    expect((after.envelope.data as { unlocked: boolean }).unlocked).toBe(false);
  });

  it('derives purchase ownership from the bearer and ignores a forged account id', async () => {
    const buyer = await signIn('sub-owner');
    const other = await signIn('sub-other');

    const jws = await signEs256(transaction(), leafKeys, chain);
    await call('POST', '/api/receipts/validate', {
      bearer: buyer.token,
      body: { signedTransaction: jws, accountId: other.accountId },
    });

    const owners = await call('GET', '/api/unlock-status', { bearer: buyer.token });
    expect((owners.envelope.data as { unlocked: boolean }).unlocked).toBe(true);
    const theirs = await call('GET', '/api/unlock-status', { bearer: other.token });
    expect((theirs.envelope.data as { unlocked: boolean }).unlocked).toBe(false);
  });
});

// -------------------------------------------------------------- contract 10 --

describe('contract 10 — analytics', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    consent: true,
    boardsStarted: 4,
    boardsCompleted: 3,
    hintsUsed: 1,
    totalSeconds: 620,
    appVersion: '0.1.0',
    anonymousSessionId: 'rotating-abcdef12',
    ...over,
  });

  it('stores a consented session', async () => {
    const { envelope } = await call('POST', '/api/analytics/session', { body: body() });
    expect((envelope.data as { stored: boolean }).stored).toBe(true);
  });

  it('discards a session with consent withheld, even with a store present', async () => {
    const { envelope } = await call('POST', '/api/analytics/session', {
      body: body({ consent: false }),
    });
    expect((envelope.data as { stored: boolean }).stored).toBe(false);
  });

  it('is not reachable from a session token — analytics is never joined to an identity', async () => {
    const { token } = await signIn('sub-analytics');
    const { envelope } = await call('POST', '/api/analytics/session', {
      bearer: token,
      body: body({ anonymousSessionId: 'rotating-99999999' }),
    });
    // The handler takes no session at all; a bearer token changes nothing.
    expect((envelope.data as { stored: boolean }).stored).toBe(true);
  });
});
