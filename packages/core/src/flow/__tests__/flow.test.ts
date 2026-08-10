/**
 * Flow and progression tests.
 *
 * The flow tests are mostly about things that must NOT happen: gameplay before
 * terms are accepted, an age gate that loops until you lie, a tutorial that
 * restarts because you took a phone call. Those are the failure modes that
 * survive a visual review, because they only show up on the second launch.
 */

import { describe, expect, it } from 'vitest';

import { EVENT_NAMES } from '../../telemetry/events';
import {
  INITIAL_PROGRESS,
  eventsFor,
  initialState,
  reduce,
  resumeScreen,
  type FlowAction,
  type FlowState,
} from '../screens';
import {
  INITIAL_PROGRESSION,
  TUNING,
  leveledUp,
  levelForXp,
  levelProgress,
  recordBoard,
  xpForLevel,
  type BoardResult,
} from '../../progression/progression';

const AT = '2026-08-09T12:00:00.000Z';

/** Runs a first-launch player all the way to home. */
function onboard(): FlowState {
  let state = initialState();
  for (const action of [
    { type: 'accept_tos', at: AT },
    { type: 'answer_age_gate', passed: true },
    { type: 'loading_finished' },
    { type: 'tutorial_step_done', step: 'tutorial_a' },
    { type: 'tutorial_step_done', step: 'tutorial_b' },
    { type: 'tutorial_step_done', step: 'tutorial_c' },
  ] as FlowAction[]) {
    state = reduce(state, action);
  }
  return state;
}

describe('first launch', () => {
  it('opens on terms', () => {
    expect(initialState().screen).toBe('tos');
  });

  it('walks the nine screens in order', () => {
    const seen: string[] = [];
    let state = initialState();
    seen.push(state.screen);

    for (const action of [
      { type: 'accept_tos', at: AT },
      { type: 'answer_age_gate', passed: true },
      { type: 'loading_finished' },
      { type: 'tutorial_step_done', step: 'tutorial_a' },
      { type: 'tutorial_step_done', step: 'tutorial_b' },
      { type: 'tutorial_step_done', step: 'tutorial_c' },
      { type: 'start_board' },
      { type: 'board_won' },
      { type: 'leave_game_over' },
    ] as FlowAction[]) {
      state = reduce(state, action);
      seen.push(state.screen);
    }

    expect(seen).toEqual([
      'tos',
      'age_gate',
      'loading',
      'tutorial_a',
      'tutorial_b',
      'tutorial_c',
      'home',
      'gameplay',
      'game_over',
      'home',
    ]);
  });

  it('cannot reach gameplay without accepting terms', () => {
    const state = initialState();
    expect(reduce(state, { type: 'start_board' }).screen).toBe('tos');
    expect(reduce(state, { type: 'answer_age_gate', passed: true }).screen).toBe('tos');
  });
});

describe('the age gate', () => {
  it('blocks and stays blocked rather than looping', () => {
    let state = reduce(initialState(), { type: 'accept_tos', at: AT });
    state = reduce(state, { type: 'answer_age_gate', passed: false });

    expect(state.ageBlocked).toBe(true);
    expect(state.screen).toBe('age_gate');
    // A blocked player must not be able to walk forward.
    expect(reduce(state, { type: 'loading_finished' }).screen).toBe('age_gate');
    expect(reduce(state, { type: 'start_board' }).screen).toBe('age_gate');
  });

  it('stays blocked across a relaunch — no retry until you lie', () => {
    let state = reduce(initialState(), { type: 'accept_tos', at: AT });
    state = reduce(state, { type: 'answer_age_gate', passed: false });

    const relaunched = initialState(state.progress);
    expect(relaunched.screen).toBe('age_gate');
    expect(relaunched.ageBlocked).toBe(true);
  });

  it('is never shown twice to someone who passed', () => {
    const done = onboard();
    expect(initialState(done.progress).screen).toBe('home');
  });
});

describe('resuming', () => {
  it('picks up mid-tutorial rather than starting over', () => {
    let state = reduce(initialState(), { type: 'accept_tos', at: AT });
    state = reduce(state, { type: 'answer_age_gate', passed: true });
    state = reduce(state, { type: 'loading_finished' });
    state = reduce(state, { type: 'tutorial_step_done', step: 'tutorial_a' });

    expect(initialState(state.progress).screen).toBe('tutorial_b');
  });

  it('sends a player who skipped the tutorial straight home', () => {
    let state = reduce(initialState(), { type: 'accept_tos', at: AT });
    state = reduce(state, { type: 'answer_age_gate', passed: true });
    state = reduce(state, { type: 'loading_finished' });
    state = reduce(state, { type: 'skip_tutorial' });

    expect(state.screen).toBe('home');
    expect(initialState(state.progress).screen).toBe('home');
  });

  it('agrees with resumeScreen at every gate', () => {
    const cases = [
      [INITIAL_PROGRESS, 'tos'],
      [{ ...INITIAL_PROGRESS, tosAcceptedAt: AT }, 'age_gate'],
      [{ ...INITIAL_PROGRESS, tosAcceptedAt: AT, agePassed: true }, 'tutorial_a'],
      [
        { ...INITIAL_PROGRESS, tosAcceptedAt: AT, agePassed: true, tutorialCompleted: 'tutorial_b' },
        'tutorial_c',
      ],
      [
        { ...INITIAL_PROGRESS, tosAcceptedAt: AT, agePassed: true, tutorialCompleted: 'tutorial_c' },
        'home',
      ],
    ] as const;

    for (const [progress, expected] of cases) {
      expect(resumeScreen(progress)).toBe(expected);
    }
  });
});

describe('the game-over screen', () => {
  it('is reached by losing as well as winning', () => {
    let state = reduce(onboard(), { type: 'start_board' });
    expect(reduce(state, { type: 'holder_full' }).screen).toBe('game_over');

    state = reduce(onboard(), { type: 'start_board' });
    expect(reduce(state, { type: 'board_won' }).screen).toBe('game_over');
  });

  it('sends a revive back to the board, not home', () => {
    let state = reduce(onboard(), { type: 'start_board' });
    state = reduce(state, { type: 'holder_full' });
    expect(reduce(state, { type: 'revive' }).screen).toBe('gameplay');
  });

  it('only counts a win toward boards completed', () => {
    let won = reduce(onboard(), { type: 'start_board' });
    won = reduce(won, { type: 'board_won' });
    expect(won.progress.boardsCompleted).toBe(1);

    let lost = reduce(onboard(), { type: 'start_board' });
    lost = reduce(lost, { type: 'holder_full' });
    expect(lost.progress.boardsCompleted).toBe(0);
  });
});

describe('instrumentation is attached to the machine, not the views', () => {
  it('emits a shown event on arrival at every gated screen', () => {
    let state = initialState();
    const emitted: string[] = [];

    for (const action of [
      { type: 'accept_tos', at: AT },
      { type: 'answer_age_gate', passed: true },
      { type: 'loading_finished' },
      { type: 'tutorial_step_done', step: 'tutorial_a' },
    ] as FlowAction[]) {
      const next = reduce(state, action);
      emitted.push(...eventsFor(action, state, next));
      state = next;
    }

    expect(emitted).toContain('tos_accepted');
    expect(emitted).toContain('age_gate_shown');
    expect(emitted).toContain('age_gate_passed');
    expect(emitted).toContain('loading_quote_shown');
    expect(emitted).toContain('tutorial_step_completed');
  });

  it('offers a revive at the moment the holder fills', () => {
    const state = reduce(onboard(), { type: 'start_board' });
    const action: FlowAction = { type: 'holder_full' };
    const events = eventsFor(action, state, reduce(state, action));
    expect(events).toContain('holder_full');
    expect(events).toContain('revive_offered');
  });

  it('only emits names the catalogue knows', () => {
    let state = initialState();
    for (const action of [
      { type: 'accept_tos', at: AT },
      { type: 'answer_age_gate', passed: true },
      { type: 'loading_finished' },
      { type: 'tutorial_step_done', step: 'tutorial_a' },
      { type: 'tutorial_step_done', step: 'tutorial_b' },
      { type: 'tutorial_step_done', step: 'tutorial_c' },
      { type: 'start_board' },
      { type: 'holder_full' },
      { type: 'revive' },
    ] as FlowAction[]) {
      const next = reduce(state, action);
      for (const event of eventsFor(action, state, next)) {
        expect(EVENT_NAMES, `"${event}" is not in the catalogue`).toContain(event);
      }
      state = next;
    }
  });
});

// ---------------------------------------------------------------- progression

const board = (over: Partial<BoardResult> = {}): BoardResult => ({
  layout: 'turtle',
  won: true,
  pairsCleared: 72,
  tilesTotal: 144,
  hintsUsed: 0,
  revivesUsed: 0,
  shufflesUsed: 0,
  elapsedSeconds: 300,
  ...over,
});

describe('levels', () => {
  it('start at 1 with no xp', () => {
    expect(INITIAL_PROGRESSION.level).toBe(1);
    expect(xpForLevel(1)).toBe(0);
  });

  it('need progressively more xp', () => {
    const steps = [2, 3, 4, 5, 10].map((n) => xpForLevel(n) - xpForLevel(n - 1));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });

  it('go up on a win', () => {
    const after = recordBoard(INITIAL_PROGRESSION, board());
    expect(after.xp).toBeGreaterThan(0);
    expect(after.level).toBeGreaterThanOrEqual(1);
    expect(leveledUp(INITIAL_PROGRESSION, after)).toBe(after.level > 1);
  });

  it('NEVER go down, even on a run of losses', () => {
    // A progress bar that moves backwards is the fastest way to lose someone.
    let progression = recordBoard(INITIAL_PROGRESSION, board());
    for (let i = 0; i < 20; i++) {
      const before = progression;
      progression = recordBoard(progression, board({ won: false, pairsCleared: 2 }));
      expect(progression.level).toBeGreaterThanOrEqual(before.level);
      expect(progression.xp).toBeGreaterThanOrEqual(before.xp);
    }
  });

  it('still pay something for a lost board', () => {
    const after = recordBoard(INITIAL_PROGRESSION, board({ won: false, pairsCleared: 30 }));
    expect(after.xp).toBeGreaterThan(0);
  });

  it('report progress through the current level as 0-1', () => {
    for (const xp of [0, 50, 500, 5000, 50000]) {
      const p = levelProgress(xp);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(levelForXp(xp)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('IQ', () => {
  it('starts at the configured centre', () => {
    expect(INITIAL_PROGRESSION.iq).toBe(TUNING.iqStart);
  });

  it('rises for clean wins and falls for repeated losses', () => {
    let strong = INITIAL_PROGRESSION;
    for (let i = 0; i < 10; i++) strong = recordBoard(strong, board());
    expect(strong.iq).toBeGreaterThan(TUNING.iqStart);

    let weak = INITIAL_PROGRESSION;
    for (let i = 0; i < 10; i++) weak = recordBoard(weak, board({ won: false, pairsCleared: 4 }));
    expect(weak.iq).toBeLessThan(TUNING.iqStart);
  });

  it('stays inside its bounds however extreme the run', () => {
    let high = INITIAL_PROGRESSION;
    let low = INITIAL_PROGRESSION;
    for (let i = 0; i < 200; i++) {
      high = recordBoard(high, board());
      low = recordBoard(low, board({ won: false, pairsCleared: 0 }));
    }
    expect(high.iq).toBeLessThanOrEqual(TUNING.iqMax);
    expect(low.iq).toBeGreaterThanOrEqual(TUNING.iqMin);
  });

  it('moves slowly — one board never defines the number', () => {
    const after = recordBoard(INITIAL_PROGRESSION, board({ won: false, pairsCleared: 0 }));
    expect(Math.abs(after.iq - TUNING.iqStart)).toBeLessThan(10);
  });

  it('does not collapse when a player uses the features we sell them', () => {
    // Hints and revives are products. A score that craters when someone buys
    // one makes the product feel like a trap.
    const unaided = recordBoard(INITIAL_PROGRESSION, board());
    const helped = recordBoard(INITIAL_PROGRESSION, board({ hintsUsed: 6, revivesUsed: 2 }));
    expect(helped.iq).toBeLessThan(unaided.iq);
    expect(helped.iq).toBeGreaterThan(TUNING.iqStart - 12);
  });
});
