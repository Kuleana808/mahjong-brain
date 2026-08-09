/**
 * Adapter tests.
 *
 * These use real keys, real signatures and real certificate chains — generated
 * in the test rather than mocked — because the thing being tested *is* the
 * cryptography. A mocked verifier that returns `true` tests nothing.
 *
 * The negative cases matter more than the positive ones. Each one is an attack
 * that would otherwise work: a token minted for another app, a transaction
 * signed by a self-issued certificate, a tampered payload, a replayed expired
 * token.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { createAppleIdentityPort } from '../appleIdentity';
import { createSessionPort } from '../session';
import { createStoreKitPort } from '../storekit';
import { createMemoryStore } from '../memoryStore';
import { parseCertificate } from '../crypto/der';
import { base64ToBytes } from '../crypto/jws';
import {
  generateEcKeyPair,
  generateRsaKeyPair,
  makeCertificate,
  publicJwk,
  signEs256,
  signRs256,
  type TestCert,
} from './testCerts';

const BUNDLE_ID = 'com.nihi.mahjong';
const PRODUCT_ID = 'com.nihi.mahjong.lifetime';
const NOW_MS = Date.UTC(2026, 7, 9, 12, 0, 0);

// ---------------------------------------------------------------- session --

describe('session tokens', () => {
  const port = createSessionPort({
    signingKey: 'x'.repeat(48),
    now: () => NOW_MS,
  });

  it('round-trips an account id', async () => {
    const { token } = await port.issue('acct_1');
    expect(await port.verify(token)).toBe('acct_1');
  });

  it('refuses a token signed with a different key', async () => {
    const other = createSessionPort({ signingKey: 'y'.repeat(48), now: () => NOW_MS });
    const { token } = await other.issue('acct_1');
    expect(await port.verify(token)).toBeNull();
  });

  it('refuses a tampered payload', async () => {
    const { token } = await port.issue('acct_1');
    const [header, , signature] = token.split('.');
    const forged = btoa(JSON.stringify({ sub: 'acct_admin', exp: 99999999999 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await port.verify(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('refuses an expired token', async () => {
    const past = createSessionPort({
      signingKey: 'x'.repeat(48),
      ttlSeconds: 60,
      now: () => NOW_MS,
    });
    const { token } = await past.issue('acct_1');

    const later = createSessionPort({
      signingKey: 'x'.repeat(48),
      now: () => NOW_MS + 61_000,
    });
    expect(await later.verify(token)).toBeNull();
  });

  it('refuses junk without throwing', async () => {
    for (const junk of [null, '', 'a', 'a.b', 'a.b.c', '....']) {
      expect(await port.verify(junk)).toBeNull();
    }
  });

  it('rejects a signing key too short to be worth having', () => {
    expect(() => createSessionPort({ signingKey: 'short' })).toThrow(/32 characters/);
  });
});

// -------------------------------------------------------- apple identity --

describe('Apple identity tokens', () => {
  let keys: CryptoKeyPair;
  let jwks: { keys: unknown[] };

  beforeAll(async () => {
    keys = await generateRsaKeyPair();
    jwks = { keys: [await publicJwk(keys, 'test-kid')] };
  });

  const portWith = (overrides: Partial<Parameters<typeof createAppleIdentityPort>[0]> = {}) =>
    createAppleIdentityPort({
      bundleId: BUNDLE_ID,
      now: () => NOW_MS,
      fetchImpl: (async () =>
        new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
      ...overrides,
    });

  const claims = (over: Record<string, unknown> = {}) => ({
    iss: 'https://appleid.apple.com',
    aud: BUNDLE_ID,
    sub: '000123.abcdef.0001',
    exp: Math.floor(NOW_MS / 1000) + 600,
    email: 'relay@privaterelay.appleid.com',
    ...over,
  });

  it('accepts a well-formed token and returns the subject', async () => {
    const token = await signRs256(claims(), keys, 'test-kid');
    const identity = await portWith().verifyIdentityToken(token);
    expect(identity.subject).toBe('000123.abcdef.0001');
    expect(identity.email).toBe('relay@privaterelay.appleid.com');
  });

  it('REFUSES a token minted for another app', async () => {
    // The attack this closes: a valid Apple token from any other app would
    // otherwise sign the holder in as one of our users — and the account
    // carries the purchase unlock.
    const token = await signRs256(claims({ aud: 'com.someone.else' }), keys, 'test-kid');
    await expect(portWith().verifyIdentityToken(token)).rejects.toThrow(/audience/i);
  });

  it('refuses a token from another issuer', async () => {
    const token = await signRs256(claims({ iss: 'https://evil.example' }), keys, 'test-kid');
    await expect(portWith().verifyIdentityToken(token)).rejects.toThrow(/issuer/i);
  });

  it('refuses an expired token', async () => {
    const token = await signRs256(
      claims({ exp: Math.floor(NOW_MS / 1000) - 3600 }),
      keys,
      'test-kid',
    );
    await expect(portWith().verifyIdentityToken(token)).rejects.toThrow(/expired/i);
  });

  it('refuses a token signed by someone else', async () => {
    const attacker = await generateRsaKeyPair();
    const token = await signRs256(claims(), attacker, 'test-kid');
    await expect(portWith().verifyIdentityToken(token)).rejects.toThrow(/does not verify/i);
  });

  it('refuses alg confusion', async () => {
    const token = await signRs256(claims(), keys, 'test-kid');
    const [, payload, signature] = token.split('.');
    const noneHeader = btoa(JSON.stringify({ alg: 'none', kid: 'test-kid' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await expect(
      portWith().verifyIdentityToken(`${noneHeader}.${payload}.${signature}`),
    ).rejects.toThrow(/algorithm/i);
  });

  it('re-fetches once when the kid is unknown, then gives up', async () => {
    let calls = 0;
    const port = portWith({
      fetchImpl: (async () => {
        calls++;
        return new Response(JSON.stringify({ keys: [await publicJwk(keys, 'rotated')] }), {
          status: 200,
        });
      }) as typeof fetch,
    });
    const token = await signRs256(claims(), keys, 'missing-kid');
    await expect(port.verifyIdentityToken(token)).rejects.toThrow(/No Apple signing key/);
    expect(calls).toBe(2);
  });

  it('will not be constructed without an audience to check', () => {
    expect(() => createAppleIdentityPort({ bundleId: '' })).toThrow(/bundleId is required/);
  });
});

// --------------------------------------------------------------- storekit --

describe('StoreKit 2 transactions', () => {
  let rootKeys: CryptoKeyPair;
  let intermediateKeys: CryptoKeyPair;
  let leafKeys: CryptoKeyPair;
  let root: TestCert;
  let intermediate: TestCert;
  let leaf: TestCert;
  let rootBase64: string;

  beforeAll(async () => {
    rootKeys = await generateEcKeyPair();
    intermediateKeys = await generateEcKeyPair();
    leafKeys = await generateEcKeyPair();

    root = await makeCertificate(rootKeys, rootKeys, 1);
    intermediate = await makeCertificate(intermediateKeys, rootKeys, 2);
    leaf = await makeCertificate(leafKeys, intermediateKeys, 3);
    rootBase64 = root.base64;
  });

  const port = () =>
    createStoreKitPort({
      appleRootCaG3Base64: rootBase64,
      expectedProductId: PRODUCT_ID,
      expectedBundleId: BUNDLE_ID,
      now: () => NOW_MS,
    });

  const payload = (over: Record<string, unknown> = {}) => ({
    bundleId: BUNDLE_ID,
    productId: PRODUCT_ID,
    originalTransactionId: '2000000000000001',
    originalPurchaseDate: NOW_MS - 86_400_000,
    environment: 'Sandbox',
    type: 'Non-Consumable',
    ...over,
  });

  const chain = () => [leaf.base64, intermediate.base64, root.base64];

  it('accepts a transaction signed by a leaf that chains to the pinned root', async () => {
    const jws = await signEs256(payload(), leafKeys, chain());
    const verified = await port().verifySignedTransaction(jws);

    expect(verified.productId).toBe(PRODUCT_ID);
    expect(verified.originalTransactionId).toBe('2000000000000001');
    expect(verified.environment).toBe('Sandbox');
    expect(verified.revoked).toBe(false);
  });

  it('REFUSES a chain that does not reach our pinned root', async () => {
    // The attack this closes: anyone can generate a key, self-issue a
    // certificate, sign a transaction saying whatever they like, and ship the
    // certificate in the header. The signature verifies perfectly. Only the
    // pinned root makes it worthless.
    const attackerRootKeys = await generateEcKeyPair();
    const attackerLeafKeys = await generateEcKeyPair();
    const attackerRoot = await makeCertificate(attackerRootKeys, attackerRootKeys, 9);
    const attackerLeaf = await makeCertificate(attackerLeafKeys, attackerRootKeys, 10);

    const jws = await signEs256(payload(), attackerLeafKeys, [
      attackerLeaf.base64,
      attackerRoot.base64,
    ]);

    await expect(port().verifySignedTransaction(jws)).rejects.toThrow(/trusted root/i);
  });

  it('refuses a chain whose links do not actually sign each other', async () => {
    // Real root at the top, but an intermediate the root never signed.
    const impostorKeys = await generateEcKeyPair();
    const impostor = await makeCertificate(impostorKeys, impostorKeys, 11);
    const forgedLeaf = await makeCertificate(leafKeys, impostorKeys, 12);

    const jws = await signEs256(payload(), leafKeys, [
      forgedLeaf.base64,
      impostor.base64,
      root.base64,
    ]);

    await expect(port().verifySignedTransaction(jws)).rejects.toThrow(/does not verify/i);
  });

  it('refuses a tampered payload', async () => {
    const jws = await signEs256(payload(), leafKeys, chain());
    const [header, , signature] = jws.split('.');
    const forged = btoa(JSON.stringify(payload({ productId: 'com.nihi.mahjong.everything' })))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await expect(
      port().verifySignedTransaction(`${header}.${forged}.${signature}`),
    ).rejects.toThrow(/does not verify/i);
  });

  it('refuses a genuine transaction for a different product', async () => {
    const jws = await signEs256(payload({ productId: 'com.someone.else.coins' }), leafKeys, chain());
    await expect(port().verifySignedTransaction(jws)).rejects.toThrow(/not our product/i);
  });

  it('refuses a genuine transaction for a different app', async () => {
    const jws = await signEs256(payload({ bundleId: 'com.someone.else' }), leafKeys, chain());
    await expect(port().verifySignedTransaction(jws)).rejects.toThrow(/different app/i);
  });

  it('reports a revoked transaction as revoked rather than throwing', async () => {
    // A refund is a fact to record, not an error. The handler turns this into
    // unlocked:false.
    const jws = await signEs256(
      payload({ revocationDate: NOW_MS - 3600_000, revocationReason: 1 }),
      leafKeys,
      chain(),
    );
    const verified = await port().verifySignedTransaction(jws);
    expect(verified.revoked).toBe(true);
  });

  it('refuses a transaction dated in the future', async () => {
    const jws = await signEs256(
      payload({ originalPurchaseDate: NOW_MS + 86_400_000 }),
      leafKeys,
      chain(),
    );
    await expect(port().verifySignedTransaction(jws)).rejects.toThrow(/future/i);
  });

  it('refuses a bare JWS with no chain at all', async () => {
    const jws = await signEs256(payload(), leafKeys, []);
    await expect(port().verifySignedTransaction(jws)).rejects.toThrow(/x5c/i);
  });

  it('fails at construction on a malformed pinned root', () => {
    expect(() =>
      createStoreKitPort({
        appleRootCaG3Base64: btoa('not a certificate'),
        expectedProductId: PRODUCT_ID,
        expectedBundleId: BUNDLE_ID,
      }),
    ).toThrow();
  });
});

// -------------------------------------------------------------------- der --

describe('certificate parsing', () => {
  it('extracts a public key WebCrypto can import', async () => {
    const keys = await generateEcKeyPair();
    const cert = await makeCertificate(keys, keys);
    const parsed = parseCertificate(base64ToBytes(cert.base64));

    expect(parsed.curve).toBe('P-256');
    const imported = await crypto.subtle.importKey(
      'spki',
      parsed.spki as unknown as ArrayBufferView<ArrayBuffer>,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );
    expect(imported.type).toBe('public');
  });

  it('refuses truncated DER instead of reading past the buffer', () => {
    expect(() => parseCertificate(new Uint8Array([0x30, 0x82, 0xff, 0xff]))).toThrow(/DER/);
  });
});

// ------------------------------------------------------------ memory store --

describe('dev store', () => {
  it('creates and finds an account by Apple subject', async () => {
    const store = createMemoryStore();
    expect(await store.findAccountByAppleSubject('sub-1')).toBeNull();

    const created = await store.createAccount('sub-1');
    expect(created.appleSubject).toBe('sub-1');
    expect((await store.findAccountByAppleSubject('sub-1'))?.accountId).toBe(created.accountId);
  });

  it('keeps settings per account', async () => {
    const store = createMemoryStore();
    await store.putSettings('acct_1', { fontScale: 1.45 } as never, 1);
    await store.putSettings('acct_2', { fontScale: 1 } as never, 1);

    expect((await store.getSettings('acct_1'))?.settings.fontScale).toBe(1.45);
    expect((await store.getSettings('acct_2'))?.settings.fontScale).toBe(1);
  });

  it('stores and returns an unlock', async () => {
    const store = createMemoryStore();
    await store.putUnlock({
      accountId: 'acct_1',
      productId: PRODUCT_ID,
      originalTransactionId: '1',
      purchasedAt: new Date(NOW_MS).toISOString(),
      environment: 'Sandbox',
      revoked: false,
      source: 'verified_transaction',
      verifiedAt: new Date(NOW_MS).toISOString(),
    });
    expect((await store.getUnlock('acct_1'))?.productId).toBe(PRODUCT_ID);
    expect(await store.getUnlock('acct_2')).toBeNull();
  });
});
