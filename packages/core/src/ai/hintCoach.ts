/**
 * The hint coach.
 *
 * One entry point. Give it a board, get back a pair to highlight and an
 * explanation that teaches the pattern rather than handing over the answer.
 *
 * TODO(PR 3): the coach currently explains the move it recommends. The next
 * step is explaining the move the player is *about to make* when it is a
 * mistake — "those two work, but they strand the other two Bamboo 3s" — which
 * needs a look-ahead over the resulting position.
 */

import type { BoardState, Tile } from '../game/board';
import { analyse, type HintAnalysis } from './analysis';
import { explainLocally, summariseLocally } from './localExplainer';
import { explainWithOllama, ollamaAvailable } from './ollama';
import { recordRoute, type Tier } from './router';

export interface Hint {
  readonly pair: readonly [Tile, Tile];
  /** The coaching text, two or three sentences. */
  readonly text: string;
  /** One line, for the screen-reader announcement. */
  readonly summary: string;
  readonly tier: Tier;
}

export interface CoachOptions {
  /**
   * Richer phrasing is part of the paid unlock. Free play still gets a real
   * hint with the same recommendation — the offline explainer is not a
   * crippled version, it is the default everyone gets.
   */
  readonly allowModelPhrasing?: boolean;
}

export async function getHint(
  board: BoardState,
  options: CoachOptions = {},
): Promise<Hint | null> {
  const analysis = analyse(board);
  if (!analysis) return null;

  const started = performance.now();
  const offline = (tier: Tier, fallbackFrom?: Tier, reason?: string): Hint => {
    recordRoute({ tier, latencyMs: performance.now() - started, fallbackFrom, reason });
    return {
      pair: analysis.pair,
      text: explainLocally(analysis),
      summary: summariseLocally(analysis),
      tier,
    };
  };

  if (!options.allowModelPhrasing) return offline('offline');

  if (!(await ollamaAvailable())) {
    return offline('offline', 'ollama', 'not reachable');
  }

  const text = await explainWithOllama(analysis);
  if (!text) return offline('offline', 'ollama', 'timed out or rejected');

  recordRoute({ tier: 'ollama', latencyMs: performance.now() - started });
  return { pair: analysis.pair, text, summary: summariseLocally(analysis), tier: 'ollama' };
}

/** Exposed for tests and for the debug panel. */
export type { HintAnalysis };
export { analyse };
