import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The age gate's answer has to reach the ad stack, and it has to reach it
 * before the first ad request.
 *
 * Ads are non-personalized for every player already
 * (`publisherPrivacyPersonalizationState = .disabled`), so this flag is not
 * what stops a teenager seeing a targeted ad — nothing is targeted. What it
 * does is give Google the under-age-of-consent signal it expects, and decide
 * which consent form the UMP SDK presents. That second part is why the value
 * must be set before `configure()` runs: the form choice cannot be revised
 * once the SDK has configured itself.
 */

const native = vi.hoisted(() => ({
  configure: vi.fn(),
  showRewarded: vi.fn(),
  showInterstitial: vi.fn(),
  showPrivacyOptions: vi.fn(),
}));

const platform = vi.hoisted(() => ({ native: true, name: 'ios' }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
  },
  registerPlugin: () => native,
}));

beforeEach(() => {
  platform.native = true;
  platform.name = 'ios';
  vi.clearAllMocks();
  vi.resetModules();
  native.configure.mockResolvedValue({ configured: true, canRequestAds: true });
  native.showInterstitial.mockResolvedValue({ status: 'completed' });
});

describe('under-age-of-consent signal', () => {
  it('defaults to false when the gate has not been answered', async () => {
    const { ads } = await import('../index');

    await ads().showInterstitial();

    expect(native.configure).toHaveBeenCalledWith({ underAgeOfConsent: false });
  });

  it('passes the flag when the player answered 13-17', async () => {
    const { ads, setUnderAgeOfConsent } = await import('../index');

    setUnderAgeOfConsent(true);
    await ads().showInterstitial();

    expect(native.configure).toHaveBeenCalledWith({ underAgeOfConsent: true });
  });

  it('does not flag an adult', async () => {
    const { ads, setUnderAgeOfConsent } = await import('../index');

    setUnderAgeOfConsent(false);
    await ads().showInterstitial();

    expect(native.configure).toHaveBeenCalledWith({ underAgeOfConsent: false });
  });

  it('configures once, so a later answer cannot change the consent form', async () => {
    // Documents the ordering constraint rather than pretending it is mutable:
    // the store sets the value during hydrate and on the answer, both of which
    // happen before any ad can be requested.
    const { ads, setUnderAgeOfConsent } = await import('../index');

    setUnderAgeOfConsent(true);
    await ads().showInterstitial();
    setUnderAgeOfConsent(false);
    await ads().showInterstitial();

    expect(native.configure).toHaveBeenCalledTimes(1);
    expect(native.configure).toHaveBeenCalledWith({ underAgeOfConsent: true });
  });

  it('never touches the native bridge off-device', async () => {
    platform.native = false;
    const { ads, setUnderAgeOfConsent } = await import('../index');

    setUnderAgeOfConsent(true);
    const result = await ads().showInterstitial();

    expect(native.configure).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'unavailable' });
  });
});
