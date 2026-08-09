/**
 * Ollama-backed phrasing for the hint coach.
 *
 * Only ever reachable on the web/dev build — a phone cannot see the Mac's
 * localhost, and we do not ship a tunnel. When it is available it rewords the
 * same structured analysis the offline explainer uses, so the *content* of a
 * hint never depends on whether a model was up. Only the phrasing varies.
 *
 * Hard budget: if it has not answered in `TIMEOUT_MS`, we drop it and use the
 * offline text. A hint that arrives late is worse than a plainer hint that
 * arrives now.
 */

import { config } from '../env';
import type { HintAnalysis } from './analysis';

const TIMEOUT_MS = 1500;
const PROBE_TIMEOUT_MS = 400;

const SYSTEM_PROMPT = [
  'You coach a calm mahjong solitaire game played mostly by people over 60.',
  'You are given a JSON description of one recommended move.',
  'Write 2 short sentences that TEACH the player to see the pattern themselves.',
  'Point at the area of the board first, then say what the move unlocks.',
  'Never list coordinates. Never say "the answer is". Never use exclamation marks.',
  'Plain, warm, unhurried English. No emoji. No markdown.',
].join(' ');

let availability: Promise<boolean> | null = null;

/** Test/host hook: forget the cached probe so config changes take effect. */
export function resetOllamaProbe(): void {
  availability = null;
}

/** Cached one-shot probe. Re-probed only on a full page load. */
export function ollamaAvailable(): Promise<boolean> {
  if (availability) return availability;

  availability = (async () => {
    if (!config().ollamaEnabled) return false;
    try {
      const response = await fetch(`${config().ollamaHost}/api/tags`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  })();

  return availability;
}

/** Returns null on timeout, error, or an answer that looks wrong. */
export async function explainWithOllama(analysis: HintAnalysis): Promise<string | null> {
  const payload = {
    tiles: analysis.faceLabel,
    look_at: analysis.regions,
    unlocks: analysis.frees.length,
    unlocks_lower_layer: analysis.frees.some((t) => t.z > 0),
    is_only_move: analysis.onlyMove,
    other_moves_available: analysis.alternatives,
    group_could_get_stranded: analysis.quartetRisk,
    tiles_left: analysis.tilesLeft,
  };

  try {
    const response = await fetch(`${config().ollamaHost}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: config().ollamaModel,
        system: SYSTEM_PROMPT,
        prompt: JSON.stringify(payload),
        stream: false,
        options: { temperature: 0.4, num_predict: 90 },
      }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { response?: string };
    const text = data.response?.trim();

    // Guard against a model that ignores the brief. Better a plain hint than a
    // rambling one.
    if (!text || text.length < 20 || text.length > 320) return null;
    return text;
  } catch {
    return null;
  }
}
