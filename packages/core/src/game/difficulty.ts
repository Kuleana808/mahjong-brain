/**
 * Silent difficulty adaptation.
 *
 * Reads two signals — how long the player takes per move, and how often they
 * ask for a hint — and picks the next board's layout. It never announces
 * itself: no "difficulty increased" toast, no setting, no badge. The player
 * should only notice that the boards keep feeling right.
 *
 * Both signals are exponentially weighted so a single distracted game does not
 * move the needle, and the layout choice has hysteresis so the player is not
 * bounced between shapes.
 */

import { LAYOUTS_BY_DIFFICULTY, type LayoutId } from './layouts';

export interface SkillProfile {
  /** EWMA of seconds per move. Null until the first board is finished. */
  readonly secondsPerMove: number | null;
  /** EWMA of hints used per move, 0-1. */
  readonly hintRate: number;
  /** EWMA of the fraction of started boards that were completed, 0-1. */
  readonly completionRate: number;
  readonly boardsPlayed: number;
  readonly boardsCompleted: number;
  /** Layout used most recently, for hysteresis. */
  readonly lastLayoutId: LayoutId | null;
}

export const INITIAL_PROFILE: SkillProfile = {
  secondsPerMove: null,
  hintRate: 0,
  completionRate: 0.5,
  boardsPlayed: 0,
  boardsCompleted: 0,
  lastLayoutId: null,
};

/** Weight on the newest sample. Slow enough that one bad game is absorbed. */
const ALPHA = 0.3;

const ewma = (previous: number | null, sample: number): number =>
  previous === null ? sample : previous * (1 - ALPHA) + sample * ALPHA;

export interface BoardOutcome {
  readonly layoutId: LayoutId;
  readonly completed: boolean;
  readonly movesPlayed: number;
  readonly hintsUsed: number;
  readonly elapsedSeconds: number;
}

export function recordOutcome(profile: SkillProfile, outcome: BoardOutcome): SkillProfile {
  // A board abandoned in the first few moves says nothing about skill; it says
  // the phone rang. Count it as played, but do not let it move the averages.
  const meaningful = outcome.movesPlayed >= 5;

  return {
    secondsPerMove: meaningful
      ? ewma(profile.secondsPerMove, outcome.elapsedSeconds / outcome.movesPlayed)
      : profile.secondsPerMove,
    hintRate: meaningful
      ? ewma(profile.hintRate, outcome.hintsUsed / outcome.movesPlayed)
      : profile.hintRate,
    completionRate: meaningful
      ? ewma(profile.completionRate, outcome.completed ? 1 : 0)
      : profile.completionRate,
    boardsPlayed: profile.boardsPlayed + 1,
    boardsCompleted: profile.boardsCompleted + (outcome.completed ? 1 : 0),
    lastLayoutId: outcome.layoutId,
  };
}

/**
 * A 0-1 skill estimate. 0 is "still learning the rules", 1 is "wants a
 * challenge". Deliberately generous at the bottom — this game is for people who
 * want to relax, and an unfairly hard board is the failure mode that matters.
 */
export function skillScore(profile: SkillProfile): number {
  if (profile.secondsPerMove === null) return 0.25; // First board is always gentle.

  // 12s+ per move reads as deliberate; 3s or less as fluent.
  const pace = clamp01((12 - profile.secondsPerMove) / 9);
  // Asking for a hint every fifth move or more reads as still learning.
  const independence = clamp01(1 - profile.hintRate * 5);
  const finishing = clamp01(profile.completionRate);

  return clamp01(pace * 0.4 + independence * 0.3 + finishing * 0.3);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Picks the layout for the next board.
 *
 * Hysteresis: a layout only changes when the skill score clears the neighbour's
 * band by a margin, so a player hovering near a boundary keeps the same shape.
 */
export function chooseLayout(profile: SkillProfile): LayoutId {
  const score = skillScore(profile);
  const ladder = LAYOUTS_BY_DIFFICULTY;
  const target = ladder[Math.min(ladder.length - 1, Math.floor(score * ladder.length))];

  if (profile.lastLayoutId === null) return ladder[0].id;

  const currentIndex = ladder.findIndex((l) => l.id === profile.lastLayoutId);
  const targetIndex = ladder.findIndex((l) => l.id === target.id);
  if (currentIndex === -1 || currentIndex === targetIndex) return target.id;

  const MARGIN = 0.08;
  const distanceIntoBand = Math.abs(score - ladder[currentIndex].relativeDifficulty);
  if (distanceIntoBand < MARGIN) return profile.lastLayoutId;

  // Move one step at a time. Nobody jumps from Pyramid to Dragon.
  const step = targetIndex > currentIndex ? 1 : -1;
  return ladder[currentIndex + step].id;
}
