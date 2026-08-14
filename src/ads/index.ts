import { Capacitor, registerPlugin } from '@capacitor/core';

export type RewardedPlacement = 'hint' | 'revive';
export type AdResult = 'completed' | 'dismissed' | 'unavailable' | 'error';

interface NativeAdResult {
  readonly status: AdResult;
  readonly message?: string;
}

interface NativeAdStatus {
  readonly configured: boolean;
  readonly canRequestAds: boolean;
}

interface NativeAds {
  configure(): Promise<NativeAdStatus>;
  showRewarded(options: { placement: RewardedPlacement }): Promise<NativeAdResult>;
  showInterstitial(): Promise<NativeAdResult>;
  showPrivacyOptions(): Promise<void>;
}

export interface Ads {
  showRewarded(placement: RewardedPlacement): Promise<NativeAdResult>;
  showInterstitial(): Promise<NativeAdResult>;
  showPrivacyOptions(): Promise<void>;
}

const native = registerPlugin<NativeAds>('MahjongAds');
let configured: Promise<boolean> | null = null;

const configure = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return false;
  configured ??= native.configure().then((status) => status.configured && status.canRequestAds).catch(() => false);
  return configured;
};

class NativeAdsProvider implements Ads {
  async showRewarded(placement: RewardedPlacement): Promise<NativeAdResult> {
    if (!(await configure())) return { status: 'unavailable' };
    return native.showRewarded({ placement }).catch(() => ({ status: 'error' }));
  }

  async showInterstitial(): Promise<NativeAdResult> {
    if (!(await configure())) return { status: 'unavailable' };
    return native.showInterstitial().catch(() => ({ status: 'error' }));
  }

  async showPrivacyOptions(): Promise<void> {
    if (await configure()) await native.showPrivacyOptions().catch(() => undefined);
  }
}

class UnavailableAds implements Ads {
  async showRewarded(): Promise<NativeAdResult> { return { status: 'unavailable' }; }
  async showInterstitial(): Promise<NativeAdResult> { return { status: 'unavailable' }; }
  async showPrivacyOptions(): Promise<void> {}
}

export class MockAds implements Ads {
  rewardedResult: NativeAdResult = { status: 'unavailable' };
  interstitialResult: NativeAdResult = { status: 'unavailable' };
  rewardedCalls: RewardedPlacement[] = [];
  interstitialCalls = 0;

  async showRewarded(placement: RewardedPlacement): Promise<NativeAdResult> {
    this.rewardedCalls.push(placement);
    return this.rewardedResult;
  }

  async showInterstitial(): Promise<NativeAdResult> {
    this.interstitialCalls += 1;
    return this.interstitialResult;
  }

  async showPrivacyOptions(): Promise<void> {}
}

let provider: Ads = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
  ? new NativeAdsProvider()
  : new UnavailableAds();

export const ads = (): Ads => provider;

/** Test seam only. Production never installs a grant-producing mock. */
export const setAds = (next: Ads): void => { provider = next; };
