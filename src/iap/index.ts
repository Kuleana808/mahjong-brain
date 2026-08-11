/**
 * The lifetime unlock.
 *
 * One product, one price, bought once, kept forever: no tiers, no consumables,
 * no subscription, no energy, no ads in either tier. `Purchases` is deliberately
 * a narrow interface so the real StoreKit implementation can drop in behind it
 * without the UI learning anything new.
 *
 * DECISION NEEDED FROM BRENT (docs/DECISIONS.md, D-005): which StoreKit bridge.
 * Until that bridge and contract 8's Apple Root CA G3 pin are configured, the
 * production default fails closed and purchase UI stays hidden. Tests may
 * inject a signed/test provider; release code never grants a mock entitlement.
 */

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
  /** True when the unlock has already been bought on this Apple ID. */
  isUnlocked(): Promise<boolean>;
  purchase(): Promise<PurchaseResult>;
  /** Required by App Review, and by anyone who changes phone. */
  restore(): Promise<PurchaseResult>;
}

/**
 * Stand-in until the StoreKit bridge is chosen. Persists to the same store the
 * real one will, so the unlocked-state plumbing is exercised for real.
 */
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
  async isUnlocked(): Promise<boolean> {
    return false;
  }

  async purchase(): Promise<PurchaseResult> {
    return { status: 'unavailable', message: 'Purchases are not available in this build.' };
  }

  async restore(): Promise<PurchaseResult> {
    return { status: 'unavailable', message: 'Restore is not available in this build.' };
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
