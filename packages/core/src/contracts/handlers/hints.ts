/**
 * Contract 5 — the AI hint coach.
 *
 * Takes a position (layout + seed + history, same as validate-move) and returns
 * a pair plus an explanation that teaches the pattern.
 *
 * Routing, in order: the offline explainer answers by default, instantly and
 * for free. Ollama rewords the *same structured analysis* when it is reachable
 * and the caller has the unlock. A frontier model is not wired — that would be
 * spend, and spend needs an explicit yes.
 *
 * Because the analysis is shared, the *recommendation* is identical whichever
 * tier answers. Only the sentence changes. That is what makes it safe to degrade
 * silently from the player's point of view — and the envelope still says so, in
 * `fallback_reason`, so it is never silent to us.
 */

import { getHint } from '../../ai/hintCoach';
import { removePair, type BoardState } from '../../game/board';
import { deal } from '../../game/deal';
import { LAYOUTS, type LayoutId } from '../../game/layouts';
import { fail, ok, type ContractEnvelope } from '../envelope';
import { nowOf, type Ports } from '../ports';
import { CONTRACT_VERSION, type HintGenerateRequest, type HintGenerateResponse } from '../types';

const CONTRACT = 'api/hints/generate';

function replay(layout: LayoutId, seed: number, removed: HintGenerateRequest['removed']): BoardState | null {
  let board = deal(layout, seed);
  for (const pair of removed ?? []) {
    const next = removePair(board, pair[0], pair[1]);
    if (next === board) return null;
    board = next;
  }
  return board;
}

export async function generateHint(
  request: HintGenerateRequest,
  ports: Ports = {},
): Promise<ContractEnvelope<HintGenerateResponse>> {
  const now = nowOf(ports);

  if (!(request.layout in LAYOUTS)) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'unknown_layout',
      message: 'Unknown layout.',
      field: 'layout',
    }, { now });
  }

  const board = replay(request.layout, request.seed, request.removed);
  if (!board) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'That sequence of moves could not have happened on this board.',
      field: 'removed',
    }, { now });
  }

  const started = Date.now();
  const hint = await getHint(board, { allowModelPhrasing: request.allowModelPhrasing });
  const latencyMs = Date.now() - started;

  if (!hint) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'no_moves',
      message: 'There are no pairs left to take.',
    }, { now, state: 'live_verified' });
  }

  // The coach asked for model phrasing and did not get it. The hint is still
  // the right hint; say why the wording is the plain one.
  const degraded =
    request.allowModelPhrasing && hint.tier === 'offline'
      ? 'Ollama unavailable or over its latency budget; answered with the offline explainer. Recommendation is unchanged.'
      : null;

  return ok<HintGenerateResponse>(
    CONTRACT,
    CONTRACT_VERSION,
    {
      pair: [hint.pair[0].id, hint.pair[1].id],
      text: hint.text,
      summary: hint.summary,
      tier: hint.tier,
      latencyMs,
    },
    { now, fallbackReason: degraded },
  );
}
