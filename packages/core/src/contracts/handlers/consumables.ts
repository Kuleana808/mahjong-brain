import { fail, notConfigured, ok, type ContractEnvelope } from '../envelope';
import { nowOf, type Ports } from '../ports';
import { CONTRACT_VERSION, type ConsumableValidateRequest, type ConsumableValidateResponse } from '../types';

const CONTRACT = 'api/consumables/validate';
const SHUFFLE_PRODUCT = 'com.nihi.mahjong.shuffle5';
const SHUFFLE_QUANTITY = 5;

export async function validateConsumable(
  request: ConsumableValidateRequest,
  sessionToken: string | null,
  ports: Ports = {},
): Promise<ContractEnvelope<ConsumableValidateResponse>> {
  const now = nowOf(ports);
  if (typeof request.signedTransaction !== 'string' || request.signedTransaction.split('.').length !== 3) {
    return fail(CONTRACT, CONTRACT_VERSION, { code: 'invalid_request', message: 'Expected a StoreKit 2 signed transaction.', field: 'signedTransaction' }, { now });
  }
  const missing = [!ports.storekit && 'APPLE_ROOT_CA_G3_BASE64 + IAP_PRODUCT_IDS + APPLE_BUNDLE_ID', !ports.store && 'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY', !ports.session && 'SESSION_SIGNING_KEY'].filter(Boolean) as string[];
  if (missing.length) return notConfigured(CONTRACT, CONTRACT_VERSION, missing, { now });
  const accountId = await ports.session!.verify(sessionToken);
  if (!accountId) return fail(CONTRACT, CONTRACT_VERSION, { code: 'unauthenticated', message: 'Sign in with Apple before buying a Shuffle pack.' }, { now, state: 'configured' });

  let verified;
  try { verified = await ports.storekit!.verifySignedTransaction(request.signedTransaction); }
  catch (cause) { return fail(CONTRACT, CONTRACT_VERSION, { code: 'unverified_transaction', message: 'That purchase could not be verified.' }, { now, state: 'configured', fallbackReason: `StoreKit transaction rejected: ${(cause as Error).message}` }); }
  if (verified.productId !== SHUFFLE_PRODUCT || verified.revoked) {
    return fail(CONTRACT, CONTRACT_VERSION, { code: 'wrong_product', message: 'That transaction is not an active Shuffle pack.' }, { now, state: 'configured' });
  }
  const inserted = await ports.store!.putConsumableGrant({ accountId, transactionId: verified.transactionId, productId: verified.productId, kind: 'shuffle', quantity: SHUFFLE_QUANTITY, purchasedAt: verified.purchasedAt, environment: verified.environment, grantedAt: now });
  const existing = inserted ? null : await ports.store!.getConsumableGrant(verified.transactionId);
  if (!inserted && existing?.accountId !== accountId) {
    return fail(CONTRACT, CONTRACT_VERSION, { code: 'transaction_claimed', message: 'That transaction belongs to another account.' }, { now, state: 'configured' });
  }
  return ok(CONTRACT, CONTRACT_VERSION, { productId: verified.productId, transactionId: verified.transactionId, kind: 'shuffle', quantityGranted: existing?.quantity ?? SHUFFLE_QUANTITY, alreadyGranted: !inserted, purchasedAt: verified.purchasedAt, environment: verified.environment }, { now, state: 'configured' });
}
