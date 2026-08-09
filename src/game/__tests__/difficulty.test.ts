import { describe, expect, it } from 'vitest';

import {
  chooseLayout,
  INITIAL_PROFILE,
  recordOutcome,
  skillScore,
  type BoardOutcome,
  type SkillProfile,
} from '../difficulty';

const outcome = (over: Partial<BoardOutcome> = {}): BoardOutcome => ({
  layoutId: 'turtle',
  completed: true,
  movesPlayed: 72,
  hintsUsed: 0,
  elapsedSeconds: 360,
  ...over,
});

const repeat = (profile: SkillProfile, o: BoardOutcome, times: number): SkillProfile =>
  Array.from({ length: times }).reduce<SkillProfile>((p) => recordOutcome(p, o), profile);

describe('recordOutcome', () => {
  it('ignores a board abandoned after a couple of moves', () => {
    const after = recordOutcome(INITIAL_PROFILE, outcome({ movesPlayed: 2, elapsedSeconds: 300 }));
    expect(after.secondsPerMove).toBeNull();
    expect(after.boardsPlayed).toBe(1);
  });

  it('tracks completions', () => {
    const after = repeat(INITIAL_PROFILE, outcome(), 3);
    expect(after.boardsCompleted).toBe(3);
    expect(after.completionRate).toBeGreaterThan(0.5);
  });

  it('seeds the average from the first meaningful board', () => {
    const first = recordOutcome(INITIAL_PROFILE, outcome({ elapsedSeconds: 72 * 4 }));
    expect(first.secondsPerMove).toBe(4);
  });

  it('moves gradually, not in one jump', () => {
    const fast = recordOutcome(INITIAL_PROFILE, outcome({ elapsedSeconds: 72 * 4 }));
    const oneSlowBoard = recordOutcome(fast, outcome({ elapsedSeconds: 72 * 20 }));
    // One 20s/move board must not drag a 4s/move average anywhere near 20.
    expect(oneSlowBoard.secondsPerMove!).toBeGreaterThan(4);
    expect(oneSlowBoard.secondsPerMove!).toBeLessThan(10);
  });
});

describe('skillScore', () => {
  it('starts gentle before any data', () => {
    expect(skillScore(INITIAL_PROFILE)).toBeLessThan(0.4);
  });

  it('rises for a fast player who finishes without hints', () => {
    const fast = repeat(
      INITIAL_PROFILE,
      outcome({ elapsedSeconds: 72 * 2, hintsUsed: 0, completed: true }),
      8,
    );
    expect(skillScore(fast)).toBeGreaterThan(0.7);
  });

  it('stays low for a slow player leaning on hints', () => {
    const learning = repeat(
      INITIAL_PROFILE,
      outcome({ elapsedSeconds: 72 * 18, hintsUsed: 30, completed: false }),
      8,
    );
    expect(skillScore(learning)).toBeLessThan(0.25);
  });

  it('is bounded to 0-1', () => {
    const extreme = repeat(
      INITIAL_PROFILE,
      outcome({ elapsedSeconds: 1, hintsUsed: 0, completed: true }),
      20,
    );
    expect(skillScore(extreme)).toBeLessThanOrEqual(1);
    expect(skillScore(extreme)).toBeGreaterThanOrEqual(0);
  });
});

describe('chooseLayout', () => {
  it('opens on the gentlest layout', () => {
    expect(chooseLayout(INITIAL_PROFILE)).toBe('pyramid');
  });

  it('never skips a rung', () => {
    const fast = repeat(
      { ...INITIAL_PROFILE, lastLayoutId: 'pyramid' },
      outcome({ layoutId: 'pyramid', elapsedSeconds: 72, hintsUsed: 0 }),
      10,
    );
    expect(chooseLayout(fast)).toBe('turtle');
  });

  it('climbs to the hardest layout over several boards', () => {
    let profile: SkillProfile = { ...INITIAL_PROFILE, lastLayoutId: 'pyramid' };
    let layout = chooseLayout(profile);
    for (let i = 0; i < 10; i++) {
      profile = recordOutcome(profile, outcome({ layoutId: layout, elapsedSeconds: 72, hintsUsed: 0 }));
      layout = chooseLayout(profile);
    }
    expect(layout).toBe('dragon');
  });

  it('steps back down when the player starts struggling', () => {
    let profile: SkillProfile = { ...INITIAL_PROFILE, lastLayoutId: 'dragon' };
    profile = repeat(
      profile,
      outcome({ layoutId: 'dragon', elapsedSeconds: 72 * 20, hintsUsed: 40, completed: false }),
      6,
    );
    expect(chooseLayout(profile)).toBe('turtle');
  });
});
