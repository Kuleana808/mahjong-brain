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
});
