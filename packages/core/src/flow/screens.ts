/**
 * The nine-screen app flow.
 *
 * SCOPE NOTE. The locked UX/UI spec lives in a private Notion page this session
 * cannot read, so everything visual — palette, type, motion, exact copy,
 * dimensions — is deliberately absent from this file. What is here is the part
 * that does not depend on any of that: which screen the app is on, what moves it
 * forward, and what must be recorded when it does.
 *
 * That split is useful regardless. The flow is the thing that has to be correct
 * and testable (a player must never see the age gate twice, must never reach
 * gameplay without accepting terms, must be able to resume mid-tutorial); the
 * visuals are the thing that has to be beautiful. Codex renders views over this
 * machine, and no screen has to own any sequencing logic of its own.
 *
 * Order, from the brief:
 *   tos → age_gate → loading → tutorial_a → tutorial_b → tutorial_c → home
 *   home → gameplay → game_over → home
 */

import type { EventName } from '../telemetry/events';

export type ScreenId =
  | 'tos'
  | 'age_gate'
  | 'loading'
  | 'tutorial_a'
  | 'tutorial_b'
  | 'tutorial_c'
  | 'home'
  | 'gameplay'
  | 'game_over';

/**
 * What the app remembers between launches.
 *
 * Only the gates live here. Board state, level and IQ live elsewhere — this is
 * "what has this person already been through", nothing more.
 */
export interface FlowProgress {
  readonly tosAcceptedAt: string | null;
  /** Null until answered. False means they failed it. */
  readonly agePassed: boolean | null;
  /** Highest tutorial screen completed, or null if never started. */
  readonly tutorialCompleted: 'tutorial_a' | 'tutorial_b' | 'tutorial_c' | null;
  readonly tutorialSkipped: boolean;
  readonly boardsCompleted: number;
}

export const INITIAL_PROGRESS: FlowProgress = {
  tosAcceptedAt: null,
  agePassed: null,
  tutorialCompleted: null,
  tutorialSkipped: false,
  boardsCompleted: 0,
};

export type FlowAction =
  | { type: 'launch' }
  | { type: 'accept_tos'; at: string }
  | { type: 'answer_age_gate'; passed: boolean }
  | { type: 'loading_finished' }
  | { type: 'tutorial_step_done'; step: 'tutorial_a' | 'tutorial_b' | 'tutorial_c' }
  | { type: 'skip_tutorial' }
  | { type: 'start_board' }
  | { type: 'board_won' }
  | { type: 'holder_full' }
  | { type: 'revive' }
  | { type: 'leave_game_over' };

export interface FlowState {
  readonly screen: ScreenId;
  readonly progress: FlowProgress;
  /**
   * True when the age gate was failed. The app must not silently loop them back
   * to it — a person who answered honestly should not be taught to lie.
   */
  readonly ageBlocked: boolean;
}

/**
 * Where a returning player lands.
 *
 * Every gate is checked in order, so a player who quit halfway through the
 * tutorial resumes at the right step rather than starting over — and one who
 * has finished everything goes straight to home, never seeing the gates again.
 */
export function resumeScreen(progress: FlowProgress): ScreenId {
  if (!progress.tosAcceptedAt) return 'tos';
  if (progress.agePassed === null) return 'age_gate';
  if (progress.agePassed === false) return 'age_gate';
  if (progress.tutorialSkipped) return 'home';

  switch (progress.tutorialCompleted) {
    case null:
      return 'tutorial_a';
    case 'tutorial_a':
      return 'tutorial_b';
    case 'tutorial_b':
      return 'tutorial_c';
    case 'tutorial_c':
      return 'home';
  }
}

export function initialState(progress: FlowProgress = INITIAL_PROGRESS): FlowState {
  // A first-ever launch goes through loading before the tutorial; a resume does
  // not, because the loading screen exists to cover the first-run setup.
  const resume = resumeScreen(progress);
  return {
    screen: resume,
    progress,
    ageBlocked: progress.agePassed === false,
  };
}

export function reduce(state: FlowState, action: FlowAction): FlowState {
  const { progress } = state;

  switch (action.type) {
    case 'launch':
      return initialState(progress);

    case 'accept_tos': {
      if (state.screen !== 'tos') return state;
      const next = { ...progress, tosAcceptedAt: action.at };
      return { ...state, progress: next, screen: 'age_gate' };
    }

    case 'answer_age_gate': {
      if (state.screen !== 'age_gate') return state;
      const next = { ...progress, agePassed: action.passed };
      if (!action.passed) {
        // Blocked, and stays blocked. No retry loop.
        return { ...state, progress: next, ageBlocked: true, screen: 'age_gate' };
      }
      return { ...state, progress: next, ageBlocked: false, screen: 'loading' };
    }

    case 'loading_finished': {
      if (state.screen !== 'loading') return state;
      return { ...state, screen: resumeScreen(progress) };
    }

    case 'tutorial_step_done': {
      if (!state.screen.startsWith('tutorial_')) return state;
      const next = { ...progress, tutorialCompleted: action.step };
      return { ...state, progress: next, screen: resumeScreen(next) };
    }

    case 'skip_tutorial': {
      if (!state.screen.startsWith('tutorial_')) return state;
      const next = { ...progress, tutorialSkipped: true };
      return { ...state, progress: next, screen: 'home' };
    }

    case 'start_board': {
      if (state.screen !== 'home' && state.screen !== 'game_over') return state;
      return { ...state, screen: 'gameplay' };
    }

    case 'board_won': {
      if (state.screen !== 'gameplay') return state;
      const next = { ...progress, boardsCompleted: progress.boardsCompleted + 1 };
      return { ...state, progress: next, screen: 'game_over' };
    }

    case 'holder_full': {
      if (state.screen !== 'gameplay') return state;
      return { ...state, screen: 'game_over' };
    }

    case 'revive': {
      // Revive returns to the board rather than to home — that is the whole
      // point of it, and the reason the ad is worth watching.
      if (state.screen !== 'game_over') return state;
      return { ...state, screen: 'gameplay' };
    }

    case 'leave_game_over': {
      if (state.screen !== 'game_over') return state;
      return { ...state, screen: 'home' };
    }
  }
}

/**
 * The events a transition must emit.
 *
 * Kept next to the machine rather than sprinkled through views, so a screen
 * cannot ship without its instrumentation — "no feature without a metric"
 * enforced by construction rather than by review attention.
 */
export function eventsFor(action: FlowAction, before: FlowState, after: FlowState): EventName[] {
  const events: EventName[] = [];

  switch (action.type) {
    case 'accept_tos':
      events.push('tos_accepted');
      break;
    case 'answer_age_gate':
      events.push(action.passed ? 'age_gate_passed' : 'age_gate_failed');
      break;
    case 'tutorial_step_done':
      events.push('tutorial_step_completed');
      if (action.step === 'tutorial_c') events.push('tutorial_completed');
      break;
    case 'skip_tutorial':
      events.push('tutorial_skipped');
      break;
    case 'start_board':
      events.push('board_start');
      break;
    case 'board_won':
      events.push('board_won');
      break;
    case 'holder_full':
      events.push('holder_full', 'revive_offered');
      break;
    case 'revive':
      events.push('revive_granted');
      break;
    default:
      break;
  }

  // Every arrival at a screen that has a "shown" event fires it, so funnel
  // drop-off always has a location.
  if (before.screen !== after.screen) {
    const shown: Partial<Record<ScreenId, EventName>> = {
      tos: 'tos_shown',
      age_gate: 'age_gate_shown',
      loading: 'loading_quote_shown',
      tutorial_a: 'tutorial_step_shown',
      tutorial_b: 'tutorial_step_shown',
      tutorial_c: 'tutorial_step_shown',
    };
    const event = shown[after.screen];
    if (event) events.push(event);
  }

  return events;
}
