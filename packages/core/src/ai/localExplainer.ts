/**
 * The offline hint coach.
 *
 * This is the default and it is not a fallback in disguise — it runs on the
 * device, answers instantly, costs nothing, and works on a plane. Local-first
 * taken all the way down: no model call at all when a deterministic explanation
 * is as good as a generated one.
 *
 * It writes the explanation the way a patient person sitting next to you would:
 * point at the area first, name the tiles second, and say what the move buys
 * you third. Never "the answer is X".
 */

import type { HintAnalysis, Region } from './analysis';

const REGION_PHRASE: Record<Region, string> = {
  'top-left': 'the top-left corner',
  top: 'along the top edge',
  'top-right': 'the top-right corner',
  left: 'the left side',
  centre: 'the middle of the board',
  right: 'the right side',
  'bottom-left': 'the bottom-left corner',
  bottom: 'along the bottom edge',
  'bottom-right': 'the bottom-right corner',
};

function whereToLook(regions: readonly Region[]): string {
  if (regions.length === 1) return REGION_PHRASE[regions[0]];
  return `${REGION_PHRASE[regions[0]]} and ${REGION_PHRASE[regions[1]]}`;
}

function countPhrase(n: number): string {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  return words[n] ?? String(n);
}

/**
 * Two or three short sentences. Long hints stop being calming.
 */
export function explainLocally(analysis: HintAnalysis): string {
  const parts: string[] = [];

  parts.push(`Look at ${whereToLook(analysis.regions)} — the two ${analysis.faceLabel} tiles there.`);

  const freed = analysis.frees.length;
  if (freed > 0) {
    const deeper = analysis.frees.filter((t) => t.z > 0).length;
    parts.push(
      deeper > 0
        ? `Taking them releases ${countPhrase(freed)} more ${freed === 1 ? 'tile' : 'tiles'}, including ${countPhrase(deeper)} from the layer underneath.`
        : `Taking them opens up ${countPhrase(freed)} more ${freed === 1 ? 'tile' : 'tiles'} beside them.`,
    );
  } else if (analysis.topLayer) {
    parts.push('Nothing is buried under them, so this one is free money — clear the top before it gets crowded.');
  } else {
    parts.push('They free nothing directly, but they clear a slot you will want later.');
  }

  if (analysis.onlyMove) {
    parts.push('It is the only pair on the board right now, so take it before anything else.');
  } else if (analysis.quartetRisk) {
    parts.push(
      `Worth doing now: two more ${analysis.faceLabel} tiles are still buried, and clearing these keeps that group from getting stranded.`,
    );
  } else if (analysis.tilesLeft <= 12) {
    parts.push('Nearly there — from here, work the highest tiles first.');
  }

  return parts.join(' ');
}

/**
 * The one-line version, for the aria-live announcement and the collapsed hint
 * chip. Same information, no coaching.
 */
export function summariseLocally(analysis: HintAnalysis): string {
  return `Two ${analysis.faceLabel} tiles, ${whereToLook(analysis.regions)}.`;
}
