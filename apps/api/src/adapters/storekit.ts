/**
 * StoreKit 2 transaction verification — contract 8.
 *
 * A signed transaction is a JWS that carries its own certificate chain in the
 * `x5c` header. Verifying the signature alone proves nothing: the certificate
 * that signed it also came from the caller. The chain has to be walked up to
 * Apple's root, and that root has to be one we pinned in advance.
 *
 * So the order is: parse, walk the chain to the pinned Apple Root CA G3, verify
 * the leaf signature, and only then read the payload. Every step throws on
 * failure, and the handler treats a throw as "no unlock" — see the fail-closed
 * note in packages/core/src/contracts/handlers/purchases.ts.
 *
 * The product id is also checked. A transaction is a real, verified purchase of
 * *something*; it is only our unlock if it is for our product.
 */

import type { StoreKitPort, VerifiedTransaction } from '@mahjong-brain/core/contracts';

import { base64ToBytes, parseJws, verifyEs256WithChain } from './crypto/jws';
import { parseCertificate } from './crypto/der';

export interface StoreKitOptions {
  /**
   * Apple Root CA G3, base64 DER (the contents of AppleRootCA-G3.cer). Download
   * from https://www.apple.com/certificateauthority/ and pin it — do not fetch
   * it at runtime, because a root you fetch is a root an attacker can serve.
   */
  readonly appleRootCaG3Base64: string;
  readonly expectedProductId: string;
  readonly expectedBundleId: string;
  readonly now?: () => number;
}

interface TransactionPayload {
  readonly productId?: string;
  readonly bundleId?: string;
  readonly originalTransactionId?: string;
  readonly transactionId?: string;
  readonly purchaseDate?: number;
  readonly originalPurchaseDate?: number;
  readonly environment?: string;
  readonly revocationDate?: number;
  readonly revocationReason?: number;
  readonly type?: string;
}

export function createStoreKitPort(options: StoreKitOptions): StoreKitPort {
  if (!options.appleRootCaG3Base64) {
    throw new Error('createStoreKitPort: appleRootCaG3Base64 is required');
  }
  if (!options.expectedProductId || !options.expectedBundleId) {
    throw new Error('createStoreKitPort: expectedProductId and expectedBundleId are required');
  }

  // Parsed once at construction, so a malformed pin fails at boot rather than
  // on the first customer's purchase.
  const rootSpki = parseCertificate(base64ToBytes(options.appleRootCaG3Base64)).spki;
  const now = options.now ?? (() => Date.now());

  return {
    async verifySignedTransaction(jwsString: string): Promise<VerifiedTransaction> {
      const jws = parseJws(jwsString);

      if (jws.header.alg !== 'ES256') {
        throw new Error(`Unexpected transaction algorithm ${String(jws.header.alg)}`);
      }

      await verifyEs256WithChain(jws, rootSpki);

      const payload = jws.payload as TransactionPayload;

      if (payload.bundleId !== options.expectedBundleId) {
        throw new Error('Transaction is for a different app');
      }
      if (payload.productId !== options.expectedProductId) {
        // Verified, genuine, and not ours.
        throw new Error(`Transaction is for ${String(payload.productId)}, not our product`);
      }

      const originalTransactionId = payload.originalTransactionId ?? payload.transactionId;
      if (!originalTransactionId) throw new Error('Transaction has no identifier');

      const purchasedMs = payload.originalPurchaseDate ?? payload.purchaseDate;
      if (typeof purchasedMs !== 'number') throw new Error('Transaction has no purchase date');
      if (purchasedMs > now() + 60_000) throw new Error('Transaction is dated in the future');

      return {
        productId: payload.productId,
        originalTransactionId: String(originalTransactionId),
        purchasedAt: new Date(purchasedMs).toISOString(),
        environment: payload.environment ?? 'Production',
        // A revocation date is how a refund and a family-sharing removal both
        // arrive. Ignoring it means giving away what somebody was refunded for.
        revoked: typeof payload.revocationDate === 'number',
      };
    },
  };
}
