import { describe, expect, it } from 'vitest';

import { levelForXp, normalizeProgression } from '../progression';

describe('persisted progression normalization', () => {
  it('derives the level from XP when an older snapshot disagrees', () => {
    const normalized = normalizeProgression({
      xp: 310,
      level: 2,
      iq: 112,
      boardsPlayed: 7,
      boardsWon: 6,
    });

    expect(normalized.level).toBe(levelForXp(310));
    expect(normalized.level).toBe(3);
  });

  it('clamps corrupt counters without discarding valid XP', () => {
    expect(normalizeProgression({
      xp: 120,
      level: 99,
      iq: 999,
      boardsPlayed: -2,
      boardsWon: 14,
    })).toEqual({
      xp: 120,
      level: 2,
      iq: 160,
      boardsPlayed: 0,
      boardsWon: 0,
    });
  });
});
