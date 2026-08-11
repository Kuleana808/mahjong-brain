/**
 * The lifetime unlock.
 *
 * One product, one price, bought once, kept forever: no tiers, no consumables,
 * no subscription, no energy, no ads in either tier. `Purchases` is deliberately
 * a narrow interface so the real StoreKit implementation can drop in behind it
 * without the UI learning anything new.
 *
 * The in-house StoreKit 2 bridge returns Apple's signed transaction JWS to
 * contract 8, whose chain terminates at the source-pinned Apple Root CA G3.
 * Missing product or server configuration fails closed. Tests may inject a
 * provider; release code never grants a mock entitlement.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

import type { ReceiptValidateResponse } from '../../packages/core/src/contracts/types';
import { loadAccountSession } from '../auth/apple';
import { apiConfigured, apiRequest } from '../services/api';

// PLACEHOLDER — derived from the bundle id, which is still Brent's call (D-001).
// Superseded in spirit by PRODUCT_CATALOGUE in @mahjong-brain/core; both change
// together once the bundle id is locked.
export const PRODUCT_ID = 'com.mahjongbrain.game.removeads';
export const PRICE_DISPLAY = '$4.99';

export interface PurchaseResult {
  readonly status: 'purchased' | 'restored' | 'cancelled' | 'unavailable' | 'error';
  readonly message?: string;
}

export interface Purchases {
  /** True/false when StoreKit answered; null when entitlement cannot be checked. */
  isUnlocked(): Promise<boolean | null>;
  purchase(): Promise<PurchaseResult>;
  /** Required by App Review, and by anyone who changes phone. */
  restore(): Promise<PurchaseResult>;
}

/** Test-only provider. Production starts unavailable and configures StoreKit explicitly. */
export class MockPurchases implements Purchases {
  private unlocked = false;

  async isUnlocked(): Promise<boolean> {
    return this.unlocked;
  }

  async purchase(): Promise<PurchaseResult> {
    this.unlocked = true;
    return { status: 'purchased' };
  }

  async restore(): Promise<PurchaseResult> {
    return this.unlocked
      ? { status: 'restored' }
      : { status: 'unavailable', message: 'No previous purchase found on this Apple ID.' };
  }
}

class UnavailablePurchases implements Purchases {
  async isUnlocked(): Promise<null> {
    return null;
  }

  async purchase(): Promise<PurchaseResult> {
    return { status: 'unavailable', message: 'Purchases are not available in this build.' };
  }

  async restore(): Promise<PurchaseResult> {
    return { status: 'unavailable', message: 'Restore is not available in this build.' };
  }
}

interface NativeStoreKitResult {
  readonly status: 'purchased' | 'entitled' | 'restored' | 'pending' | 'cancelled' | 'not_found';
  readonly productId?: string;
  readonly transactionId?: string;
  readonly signedTransaction?: string;
}

interface NativeStoreKit {
  purchase(options: { productId: string }): Promise<NativeStoreKitResult>;
  currentEntitlement(options: { productId: string }): Promise<NativeStoreKitResult>;
  restore(options: { productId: string }): Promise<NativeStoreKitResult>;
  finish(options: { transactionId: string }): Promise<void>;
}

const storeKitGlobal = globalThis as typeof globalThis & { __mahjongStoreKit?: NativeStoreKit };
const NativeStoreKit = storeKitGlobal.__mahjongStoreKit ??= registerPlugin<NativeStoreKit>('MahjongStoreKit');

class VerifiedStoreKitPurchases implements Purchases {
  private readonly productId: string;

  constructor(productId: string) {
    this.productId = productId;
  }

  async isUnlocked(): Promise<boolean | null> {
    try {
      const result = await NativeStoreKit.currentEntitlement({ productId: this.productId });
      if (result.status === 'not_found') return false;
      return await this.verifyAndFinish(result);
    } catch {
      // Offline, timeout, or verifier outage is not evidence of revocation.
      return null;
    }
  }

  async purchase(): Promise<PurchaseResult> {
    try {
      const result = await NativeStoreKit.purchase({ productId: this.productId });
      if (result.status === 'cancelled') return { status: 'cancelled' };
      if (result.status === 'pending') {
        return { status: 'unavailable', message: 'The purchase is waiting for approval.' };
      }
      return (await this.verifyAndFinish(result))
        ? { status: 'purchased' }
        : { status: 'error', message: 'Apple confirmed the purchase, but secure verification is unavailable.' };
    } catch {
      return { status: 'error', message: 'The purchase could not be completed.' };
    }
  }

  async restore(): Promise<PurchaseResult> {
    try {
      const result = await NativeStoreKit.restore({ productId: this.productId });
      if (result.status === 'not_found') {
        return { status: 'unavailable', message: 'No previous purchase was found for this Apple ID.' };
      }
      return (await this.verifyAndFinish(result))
        ? { status: 'restored' }
        : { status: 'error', message: 'The purchase was found, but secure verification is unavailable.' };
    } catch {
      return { status: 'error', message: 'Purchases could not be restored.' };
    }
  }

  private async verifyAndFinish(result: NativeStoreKitResult): Promise<boolean> {
    if (
      !result.signedTransaction ||
      !result.transactionId ||
      result.productId !== this.productId
    ) {
      return false;
    }
    const session = await loadAccountSession();
    const envelope = await apiRequest<ReceiptValidateResponse>('/api/receipts/validate', {
      method: 'POST',
      bearer: session?.token,
      body: { signedTransaction: result.signedTransaction },
    });
    if (!envelope.data?.unlocked || envelope.data.productId !== this.productId) return false;
    await NativeStoreKit.finish({ transactionId: result.transactionId });
    return true;
  }
}

let active: Purchases = new UnavailablePurchases();
let configured = false;

export function purchases(): Purchases {
  return active;
}

export function purchasesConfigured(): boolean {
  return configured;
}

export function setPurchases(implementation: Purchases): void {
  active = implementation;
  configured = true;
}

/** Configures the native bridge only when every security boundary is present. */
export function configureNativePurchases(): void {
  const productId = import.meta.env.VITE_IAP_PRODUCT_ID?.trim();
  if (
    configured ||
    !productId ||
    productId.includes('com.mahjongbrain.game') ||
    !apiConfigured() ||
    !Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() !== 'ios'
  ) {
    return;
  }
  setPurchases(new VerifiedStoreKitPurchases(productId));
}
