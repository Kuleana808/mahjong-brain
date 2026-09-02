/**
 * Contracts 8 and 9 — receipt validation and unlock status.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: no API reports a payment from a click
 * or a handoff. Only a cryptographically verified StoreKit transaction — or an
 * App Store server notification, which is the same signature by another route —
 * establishes a purchase.
 *
 * Concretely that means:
 *   - `unlocked: true` is returned only after `verifySignedTransaction` has
 *     resolved. Every failure path returns `unlocked: false`.
 *   - `UnlockStatusResponse.source` has no `client_claim` variant, because a
 *     client cannot assert a purchase into existence.
 *   - When the verifier is not configured, this answers `source_available` and
 *     says so. It never falls back to trusting the caller. A missing key must
 *     fail closed — an unlock handed out by a misconfigured server is a bug
 *     that costs revenue and, worse, cannot be taken back gracefully.
 *
 * `revoked` matters as much as `purchased`: refunds and family-sharing removal
 * both arrive as revocations, and an app that ignores them keeps giving away
 * what someone was refunded for.
 */

import { fail, notConfigured, ok, type ContractEnvelope } from '../envelope';
import { nowOf, type Ports } from '../ports';
import {
  CONTRACT_VERSION,
  type ReceiptValidateRequest,
  type ReceiptValidateResponse,
  type UnlockStatusResponse,
} from '../types';

const VALIDATE = 'api/receipts/validate';
const STATUS = 'api/unlock-status';

export async function validateReceipt(
  request: ReceiptValidateRequest,
  sessionToken: string | null,
  ports: Ports = {},
): Promise<ContractEnvelope<ReceiptValidateResponse>> {
  const now = nowOf(ports);

  if (typeof request.signedTransaction !== 'string' || request.signedTransaction.split('.').length !== 3) {
    return fail(VALIDATE, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'Expected a StoreKit 2 signed transaction.',
      field: 'signedTransaction',
    }, { now });
  }

  const missing: string[] = [];
  if (!ports.storekit) {
    missing.push('APPLE_ROOT_CA_G3_BASE64 + IAP_PRODUCT_ID + APPLE_BUNDLE_ID (blocked on D-005)');
  }
  if (!ports.store) missing.push('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  if (sessionToken && !ports.session) missing.push('SESSION_SIGNING_KEY');
  if (missing.length > 0) {
    // Fails closed, by design. See the note at the top of this file.
    return notConfigured(VALIDATE, CONTRACT_VERSION, missing, { now });
  }

  let accountId: string | null = null;
  if (sessionToken) {
    accountId = await ports.session!.verify(sessionToken);
    if (!accountId) {
      return fail(VALIDATE, CONTRACT_VERSION, {
        code: 'invalid_session',
        message: 'Sign in again before syncing this purchase.',
      }, { now, state: 'configured' });
    }
  }

  let verified;
  try {
    verified = await ports.storekit!.verifySignedTransaction(request.signedTransaction);
  } catch (cause) {
    return fail(VALIDATE, CONTRACT_VERSION, {
      code: 'unverified_transaction',
      message: 'That purchase could not be verified. Try Restore Purchases.',
    }, {
      now,
      // Verifier present and running; this transaction failed it.
      state: 'configured',
      fallbackReason: `StoreKit transaction rejected: ${(cause as Error).message}`,
    });
  }

  const unlocked = !verified.revoked;

  if (accountId && ports.store) {
    await ports.store.putUnlock({
      accountId,
      productId: verified.productId,
      originalTransactionId: verified.originalTransactionId,
      purchasedAt: verified.purchasedAt,
      environment: verified.environment,
      revoked: verified.revoked,
      source: 'verified_transaction',
      verifiedAt: now,
    });
  }

  return ok<ReceiptValidateResponse>(
    VALIDATE,
    CONTRACT_VERSION,
    {
      unlocked,
      productId: verified.productId,
      originalTransactionId: verified.originalTransactionId,
      purchasedAt: verified.purchasedAt,
      environment: verified.environment,
      revoked: verified.revoked,
    },
    {
      now,
      state: 'configured',
      fallbackReason: verified.revoked
        ? 'Transaction verified but revoked (refund or family-sharing removal); the unlock does not apply.'
        : null,
    },
  );
}

export async function unlockStatus(
  sessionToken: string | null,
  ports: Ports = {},
): Promise<ContractEnvelope<UnlockStatusResponse>> {
  const now = nowOf(ports);

  const missing: string[] = [];
  if (!ports.store) missing.push('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  if (!ports.session) missing.push('SESSION_SIGNING_KEY');
  if (missing.length > 0) {
    // Not an error for the player: a signed-out player has no server-side
    // unlock, and the device's own StoreKit entitlement still governs. The
    // honest answer is "we do not know from here".
    return ok<UnlockStatusResponse>(
      STATUS,
      CONTRACT_VERSION,
      { unlocked: false, source: 'none', productId: null, verifiedAt: null },
      {
        now,
        state: 'source_available',
        fallbackReason: `Server-side unlock lookup not configured (${missing.join(', ')}). The device's StoreKit entitlement remains authoritative.`,
      },
    );
  }

  const accountId = await ports.session!.verify(sessionToken);
  if (!accountId) {
    return ok<UnlockStatusResponse>(
      STATUS,
      CONTRACT_VERSION,
      { unlocked: false, source: 'none', productId: null, verifiedAt: null },
      {
        now,
        state: 'configured',
        fallbackReason: 'Not signed in; no cross-device unlock to report.',
      },
    );
  }

  const record = await ports.store!.getUnlock(accountId);
  if (!record || record.revoked) {
    return ok<UnlockStatusResponse>(
      STATUS,
      CONTRACT_VERSION,
      { unlocked: false, source: 'none', productId: null, verifiedAt: null },
      {
        now,
        state: 'configured',
        fallbackReason: record?.revoked ? 'Purchase was refunded or revoked.' : null,
      },
    );
  }

  return ok<UnlockStatusResponse>(
    STATUS,
    CONTRACT_VERSION,
    {
      unlocked: true,
      source: record.source,
      productId: record.productId,
      verifiedAt: record.verifiedAt,
    },
    { now, state: 'configured' },
  );
}
