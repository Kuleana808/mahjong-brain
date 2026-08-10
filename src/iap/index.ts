/**
 * The lifetime unlock.
 *
 * One product, one price, bought once, kept forever: no tiers, no consumables,
 * no subscription, no energy, no ads in either tier. `Purchases` is deliberately
 * a narrow interface so the real StoreKit implementation can drop in behind it
 * without the UI learning anything new.
 *
 * DECISION NEEDED FROM BRENT (docs/DECISIONS.md, D-005): which StoreKit bridge.
 * `@capacitor-community/in-app-purchases` is free and thin but lightly
 * maintained; RevenueCat is free under $2.5k/mo tracked revenue but is a vendor
 * and therefore needs an explicit yes. Until that call, `MockPurchases` is
 * wired up everywhere and the paywall is fully playable in the simulator.
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

let active: Purchases = new MockPurchases();

export function purchases(): Purchases {
  return active;
}

export function setPurchases(implementation: Purchases): void {
  active = implementation;
}
