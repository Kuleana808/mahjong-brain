import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => ({ Preferences: { get: async () => ({ value: null }), set: async () => {} } }));
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: async () => {} }, ImpactStyle: { Light: 'LIGHT' } }));
vi.mock('../../render/boardRenderer', () => ({ render: () => undefined, clearFaceCache: () => undefined }));

const { QA_FIXTURE_IDS, applyQaFixture } = await import('../fixtures');
const { useGame } = await import('../../state/store');

describe('deterministic QA fixtures', () => {
  beforeEach(() => useGame.setState({ hydrated: true, announcement: '' }));

  it('builds every named fixture without random play', async () => {
    for (const id of QA_FIXTURE_IDS) await expect(applyQaFixture(id)).resolves.toBeUndefined();
  });

  it('exposes the zero-Shuffle storefront trigger without disabling play', async () => {
    await applyQaFixture('S08-game-shuffle-empty');
    expect(useGame.getState().inventory.shuffle).toBe(0);
    expect(useGame.getState().status).toBe('playing');
  });

  it('creates exact holder occupancy states', async () => {
    for (const count of [0, 1, 2, 3, 4]) {
      const id = (count === 4 ? 'S09-holder-full' : `S08-game-${['empty', 'one', 'two', 'three'][count]}`) as Parameters<typeof applyQaFixture>[0];
      await applyQaFixture(id);
      expect(useGame.getState().holder).toHaveLength(count);
    }
    expect(useGame.getState().status).toBe('holder_full');
  });

  it('keeps the resume fixture visibly truthful', async () => {
    await applyQaFixture('S08-game-resume');
    expect(useGame.getState().holder).toHaveLength(1);
    expect(useGame.getState().announcement).toMatch(/restored/i);
  });

  it('does not let persisted inventory invalidate gameplay fixtures', async () => {
    useGame.setState({ inventory: { hint: 0, shuffle: 0, revive: 0 } });

    await applyQaFixture('S08-game-hint');

    expect(useGame.getState().hint).not.toBeNull();
    expect(useGame.getState().inventory).toEqual({ hint: 2, shuffle: 1, revive: 0 });
  });

  it('shows truthful completed progress in the completion fixture', async () => {
    await applyQaFixture('S10-complete');
    expect(useGame.getState().boardsCompleted).toBe(1);
    expect(useGame.getState().progression.boardsWon).toBe(1);
  });

  it('exposes every P0 state that requires deterministic visual evidence', () => {
    const required = [
      'S01-terms-rest', 'S01-terms-focus', 'S02-age-rest',
      'S03-loading', 'S03-loading-offline',
      'S04-tutorial-match', 'S05-tutorial-edge', 'S06-tutorial-holder',
      'S07-home-new', 'S07-home-progress', 'S07-home-offline',
      'S08-game-empty', 'S08-game-one', 'S08-game-two', 'S08-game-three',
      'S08-game-match', 'S08-game-hint', 'S08-game-blocked', 'S08-game-shuffle', 'S08-game-resume',
      'S09-holder-full', 'S10-complete',
      'S12-settings', 'S12-settings-large', 'S12-settings-offline',
      'S16-generic-offline', 'S17-generic-error', 'S18-maintenance',
      'S19-theme-tiles', 'S19-theme-backgrounds',
      'S20-remove-ads', 'S20-shuffle-store',
    ] as const;
    for (const id of required) expect(QA_FIXTURE_IDS).toContain(id);
  });

  it('exposes truthful StoreKit review states with localized display prices', async () => {
    await applyQaFixture('S20-remove-ads');
    expect(useGame.getState().paywallOpen).toBe(true);
    expect(useGame.getState().purchaseDisplayPrice).toBe('$4.99');

    await applyQaFixture('S20-shuffle-store');
    expect(useGame.getState().inventory.shuffle).toBe(0);
    expect(useGame.getState().status).toBe('playing');
  });

  it('anchors both theme fixtures on home with approved local selections', async () => {
    for (const id of ['S19-theme-tiles', 'S19-theme-backgrounds'] as const) {
      await applyQaFixture(id);
      expect(useGame.getState().flow.screen).toBe('home');
      expect(useGame.getState().settings.tileStyle).toBeTruthy();
      expect(useGame.getState().settings.theme).toBeTruthy();
    }
  });

  it('creates a real match transition through the public tap action', async () => {
    await applyQaFixture('S08-game-match');
    expect(useGame.getState().holder).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 560));
    expect(useGame.getState().holder).toHaveLength(0);
    expect(useGame.getState().board!.removed).toHaveLength(1);
  });

  it('keeps offline settings local and visibly honest', async () => {
    await applyQaFixture('S12-settings-offline');
    expect(useGame.getState().settingsOpen).toBe(true);
    expect(useGame.getState().announcement).toMatch(/saved on this device/i);
  });
});
