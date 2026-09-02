/**
 * Level and IQ score — the two progression surfaces the parity brief names.
 *
 * TUNING IS PROVISIONAL. The locked spec is in a Notion page this session
 * cannot read, so every number below is a defensible default rather than the
 * specified one. They are all gathered in `TUNING` so swapping them in is one
 * edit, and none of the logic depends on their particular values.
 *
 * The two exist for different reasons and must not be collapsed into one:
 *
 * **Level** is a ratchet. It only ever goes up, it rewards showing up, and it
 * is what a daily reward ladder and an unlock schedule hang off. Losing must
 * never take a level away — a progress bar that goes backwards is the fastest
 * way to make someone close the app.
 *
 * **IQ** is an estimate. It moves both ways, it responds to *how* a board was
 * played rather than whether it was finished, and it is the number that makes
 * a player feel measured. It is deliberately slow-moving and bounded, because
 * a score that swings wildly reads as arbitrary rather than as a measurement.
 */

import type { LayoutId } from '../game/layouts';

export const TUNING = {
  /** XP per tile pair cleared, and the bonus for finishing a board. */
  xpPerPair: 4,
  xpBoardCompleteBonus: 60,
  /** A lost board still pays, at a reduced rate. Effort is not nothing. */
  xpLossMultiplier: 0.5,
  /** Level N needs this much total XP: base * N^curve. */
  xpCurveBase: 120,
  xpCurveExponent: 1.35,

  /** IQ starts here and stays inside these bounds. */
  iqStart: 100,
  iqMin: 60,
  iqMax: 160,
  /** Weight on a single board. Low, so one game never defines the number. */
  iqAlpha: 0.18,
} as const;

export interface Progression {
  readonly xp: number;
  readonly level: number;
  readonly iq: number;
  readonly boardsPlayed: number;
  readonly boardsWon: number;
}

export const INITIAL_PROGRESSION: Progression = {
  xp: 0,
  level: 1,
  iq: TUNING.iqStart,
  boardsPlayed: 0,
  boardsWon: 0,
};

/** Total XP required to have reached `level`. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(TUNING.xpCurveBase * Math.pow(level - 1, TUNING.xpCurveExponent));
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

/**
 * Reconcile persisted progression after tuning changes or an interrupted
 * migration. XP is authoritative; level is derived so the UI can never show
 * more XP than the current level requires.
 */
export function normalizeProgression(value: Progression): Progression {
  const xp = Number.isFinite(value.xp) ? Math.max(0, Math.round(value.xp)) : 0;
  return {
    ...value,
    xp,
    level: levelForXp(xp),
    iq: Number.isFinite(value.iq)
      ? Math.min(TUNING.iqMax, Math.max(TUNING.iqMin, Math.round(value.iq)))
      : TUNING.iqStart,
    boardsPlayed: Number.isFinite(value.boardsPlayed) ? Math.max(0, Math.round(value.boardsPlayed)) : 0,
    boardsWon: Number.isFinite(value.boardsWon)
      ? Math.min(
          Number.isFinite(value.boardsPlayed) ? Math.max(0, Math.round(value.boardsPlayed)) : 0,
          Math.max(0, Math.round(value.boardsWon)),
        )
      : 0,
  };
}

/** Progress through the current level, 0-1. For the bar, not for logic. */
export function levelProgress(xp: number): number {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  if (ceiling <= floor) return 1;
  return Math.min(1, Math.max(0, (xp - floor) / (ceiling - floor)));
}

export interface BoardResult {
  readonly layout: LayoutId;
  readonly won: boolean;
  readonly pairsCleared: number;
  readonly tilesTotal: number;
  readonly hintsUsed: number;
  readonly revivesUsed: number;
  readonly shufflesUsed: number;
  readonly elapsedSeconds: number;
}

/**
 * How well one board was played, 0-1.
 *
 * Completion matters most, then how much of the board was cleared, then how
 * much help was taken. Assistance is discounted rather than punished: a player
 * leaning on hints is still playing, and a score that collapses when someone
 * uses the feature we sell them is a score that makes the feature feel like a
 * trap.
 */
function boardQuality(result: BoardResult): number {
  const clearedFraction =
    result.tilesTotal > 0 ? Math.min(1, (result.pairsCleared * 2) / result.tilesTotal) : 0;

  const assists = result.hintsUsed + result.revivesUsed * 2 + result.shufflesUsed;
  // Each assist costs a little, with a floor so heavy help never zeroes it.
  const independence = Math.max(0.35, 1 - assists * 0.05);

  const base = result.won ? 0.7 + clearedFraction * 0.3 : clearedFraction * 0.7;
  return Math.min(1, Math.max(0, base * independence));
}

/**
 * Folds a finished board into the profile.
 *
 * Level never decreases. IQ moves toward the quality of this board, slowly.
 */
export function recordBoard(current: Progression, result: BoardResult): Progression {
  const rawXp = result.pairsCleared * TUNING.xpPerPair + (result.won ? TUNING.xpBoardCompleteBonus : 0);
  const xpGained = Math.round(result.won ? rawXp : rawXp * TUNING.xpLossMultiplier);
  const xp = current.xp + xpGained;

  const quality = boardQuality(result);
  // Map 0-1 quality onto the IQ range, then ease toward it.
  const target = TUNING.iqMin + quality * (TUNING.iqMax - TUNING.iqMin);
  const iq = Math.round(current.iq + (target - current.iq) * TUNING.iqAlpha);

  return {
    xp,
    level: levelForXp(xp),
    iq: Math.min(TUNING.iqMax, Math.max(TUNING.iqMin, iq)),
    boardsPlayed: current.boardsPlayed + 1,
    boardsWon: current.boardsWon + (result.won ? 1 : 0),
  };
}

/** True when the last board crossed a level boundary — the moment to celebrate. */
export function leveledUp(before: Progression, after: Progression): boolean {
  return after.level > before.level;
}
