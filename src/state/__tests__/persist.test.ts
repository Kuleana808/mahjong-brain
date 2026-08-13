import { beforeEach, describe, expect, it, vi } from 'vitest';

let releaseFirst: (() => void) | null = null;
const writes: string[] = [];

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async () => ({ value: null }),
    set: vi.fn(async ({ value }: { value: string }) => {
      if (writes.length === 0) await new Promise<void>((resolve) => { releaseFirst = resolve; });
      writes.push(value);
    }),
  },
}));

const { flushPersisted, savePersisted } = await import('../persist');

const snapshot = (resume: unknown) => ({ version: 1 as const, settings: {}, progress: {}, resume });

describe('persisted write ordering', () => {
  beforeEach(() => {
    writes.length = 0;
    releaseFirst = null;
  });

  it('never lets an older slow write finish after a newer move', async () => {
    const first = savePersisted(snapshot({ holder: [1] }));
    const second = savePersisted(snapshot({ holder: [1, 2] }));
    await Promise.resolve();
    releaseFirst?.();
    await Promise.all([first, second, flushPersisted()]);

    expect(writes).toHaveLength(2);
    expect(JSON.parse(writes[1]).resume.holder).toEqual([1, 2]);
  });
});
