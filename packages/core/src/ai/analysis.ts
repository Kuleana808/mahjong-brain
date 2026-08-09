/**
 * Turning a board position into something explainable.
 *
 * The hint coach's job is not "here is a pair" — it is "here is what to look
 * at, and here is why it matters". That needs structure, not prose: which pair,
 * where it sits, what it unlocks, and what happens if the player ignores it.
 * Everything downstream (the offline explainer, the Ollama explainer) reads
 * this object and nothing else.
 */

import { availableMoves, freeTiles, tilesFreedBy, type BoardState, type Tile } from '../game/board';
import { LAYOUTS } from '../game/layouts';
import { faceName, matchGroup } from '../game/tiles';

export type Region =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'centre'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface HintAnalysis {
  readonly pair: readonly [Tile, Tile];
  readonly faceLabel: string;
  /** Where to look. Both tiles' region, or a pair of regions if they differ. */
  readonly regions: readonly Region[];
  /** Tiles that become free once this pair goes. */
  readonly frees: readonly Tile[];
  /** True when this is the only pair available at all. */
  readonly onlyMove: boolean;
  /** How many other pairs the player could take instead. */
  readonly alternatives: number;
  /**
   * True when all four tiles of this match group are on the board and two of
   * them are free — taking the wrong two can strand the other two.
   */
  readonly quartetRisk: boolean;
  /** Highest layer the pair sits on. Deeper picks unlock more. */
  readonly topLayer: boolean;
  readonly tilesLeft: number;
}

function regionOf(tile: Tile, board: BoardState): Region {
  const { minX, minY, maxX, maxY } = LAYOUTS[board.layoutId].bounds;
  const fx = (tile.x + 0.5 - minX) / (maxX - minX);
  const fy = (tile.y + 0.5 - minY) / (maxY - minY);

  const col = fx < 0.34 ? 'left' : fx > 0.66 ? 'right' : 'centre';
  const row = fy < 0.34 ? 'top' : fy > 0.66 ? 'bottom' : 'middle';

  if (row === 'middle' && col === 'centre') return 'centre';
  if (row === 'middle') return col as Region;
  if (col === 'centre') return row as Region;
  return `${row}-${col}` as Region;
}

/**
 * Scores a candidate move. Higher is better.
 *
 * Priorities, in order: unlock buried tiles, work from the top down, and clear
 * a match group whose remaining tiles are getting hard to reach. That last one
 * is the mistake beginners make — leaving two of a quartet stranded under the
 * stack — so it is worth real weight.
 */
function scoreMove(board: BoardState, move: readonly [Tile, Tile]): number {
  const frees = tilesFreedBy(board, [move[0].id, move[1].id]).length;
  const depth = move[0].z + move[1].z;
  const group = matchGroup(move[0].face);
  const live = board.tiles.filter((t) => board.remaining.has(t.id));
  const siblings = live.filter((t) => matchGroup(t.face) === group).length;
  const buriedSiblings = siblings - 2;
  return frees * 3 + depth * 1.5 + (buriedSiblings > 0 ? 2 : 0);
}

/** The move the coach recommends, or null when the board has no move left. */
export function bestMove(board: BoardState): readonly [Tile, Tile] | null {
  const moves = availableMoves(board);
  if (moves.length === 0) return null;
  return moves.reduce((best, move) => (scoreMove(board, move) > scoreMove(board, best) ? move : best));
}

export function analyse(board: BoardState): HintAnalysis | null {
  const moves = availableMoves(board);
  if (moves.length === 0) return null;

  const pair = bestMove(board)!;
  const [a, b] = pair;
  const regions = [...new Set([regionOf(a, board), regionOf(b, board)])];
  const live = board.tiles.filter((t) => board.remaining.has(t.id));
  const group = matchGroup(a.face);
  const groupTiles = live.filter((t) => matchGroup(t.face) === group);
  const freeIds = new Set(freeTiles(board).map((t) => t.id));

  return {
    pair,
    faceLabel: faceName(a.face),
    regions,
    frees: tilesFreedBy(board, [a.id, b.id]),
    onlyMove: moves.length === 1,
    alternatives: moves.length - 1,
    quartetRisk:
      groupTiles.length >= 4 && groupTiles.filter((t) => freeIds.has(t.id)).length === 2,
    topLayer: Math.max(a.z, b.z) === Math.max(...live.map((t) => t.z)),
    tilesLeft: board.remaining.size,
  };
}
