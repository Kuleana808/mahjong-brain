import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} },
}));
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: async () => {} }, ImpactStyle: { Light: 'LIGHT' } }));
vi.mock('../../render/boardRenderer', () => ({ render: () => undefined, clearFaceCache: () => undefined }));

const { startSession } = await import('../../../packages/core/src/play/session');
const { MockAds, setAds } = await import('../../ads');
const { useGame } = await import('../store');

describe('rewarded Revive pending state', () => {
  it('prevents duplicate ad requests while a rewarded Revive is loading', async () => {
    let finish: ((value: { status: 'dismissed' }) => void) | undefined;
    let calls = 0;
    const provider = new MockAds();
    provider.showRewarded = async () => {
      calls += 1;
      return new Promise((resolve) => { finish = resolve; });
    };
    setAds(provider);

    const board = startSession('pyramid', 0x4d41484a).board;
    useGame.setState({
      board,
      holder: [1, 2, 3, 4],
      status: 'holder_full',
      inventory: { hint: 0, shuffle: 0, revive: 0 },
      revivePending: false,
    });

    const first = useGame.getState().useRevive();
    const second = useGame.getState().useRevive();

    expect(useGame.getState().revivePending).toBe(true);
    expect(calls).toBe(1);

    finish?.({ status: 'dismissed' });
    await Promise.all([first, second]);

    expect(useGame.getState().revivePending).toBe(false);
    expect(useGame.getState().status).toBe('holder_full');
  });
});
