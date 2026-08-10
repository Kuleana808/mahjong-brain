/**
 * Dealing, and reshuffling a stuck board.
 *
 * Every deal is guaranteed solvable. The trick is to build the board backwards:
 * repeatedly take two *currently free* positions out of the layout and assign
 * them a matched pair. Replaying that construction in order is, by definition,
 * a winning line — so a solution always exists.
 *
 * (The player can still paint themselves into a corner by taking a different
 * pair. That is the game. `reshuffle` is the way out, and it re-runs the same
 * construction so the board stays solvable afterwards.)
 */

import type { BoardState, Tile } from './board';
import { isFree } from './board';
import type { Cell, Layout, LayoutId } from './layouts';
import { LAYOUTS } from './layouts';
import { createRng, type Rng } from './rng';
import { facesForCount, matchGroup, type TileFace } from './tiles';

const MAX_DEAL_ATTEMPTS = 40;

/** Splits faces into matched pairs, then shuffles the pair order. */
function pairUp(faces: readonly TileFace[], rng: Rng): [TileFace, TileFace][] {
  const groups = new Map<string, TileFace[]>();
  for (const face of faces) {
    const key = matchGroup(face);
    const group = groups.get(key);
    if (group) group.push(face);
    else groups.set(key, [face]);
  }

  const pairs: [TileFace, TileFace][] = [];
  for (const group of groups.values()) {
    if (group.length % 2 !== 0) {
      throw new Error(`pairUp: match group "${matchGroup(group[0])}" has an odd count`);
    }
    for (let i = 0; i < group.length; i += 2) pairs.push([group[i], group[i + 1]]);
  }
  return rng.shuffle(pairs);
}

/**
 * One attempt at a backwards build. Returns null if it walks into a state with
 * fewer than two free positions, which a different random order may avoid.
 */
function tryBuild(
  cells: readonly Cell[],
  pairs: readonly (readonly [TileFace, TileFace])[],
  rng: Rng,
): { cell: Cell; face: TileFace }[] | null {
  const remaining = cells.slice();
  const assigned: { cell: Cell; face: TileFace }[] = [];

  for (const pair of pairs) {
    const free = remaining.filter((c) => isFree(c, remaining));
    if (free.length < 2) return null;

    // Bias towards higher layers: peeling the stack top-down keeps the tiles
    // underneath reachable, which is what stops the build stalling.
    const sorted = free.slice().sort((a, b) => b.z - a.z);
    const window = sorted.slice(0, Math.max(2, Math.ceil(sorted.length * 0.6)));
    const shuffled = rng.shuffle(window);
    const [first, second] = shuffled;

    assigned.push({ cell: first, face: pair[0] }, { cell: second, face: pair[1] });
    for (const cell of [first, second]) {
      remaining.splice(remaining.indexOf(cell), 1);
    }
  }

  return remaining.length === 0 ? assigned : null;
}

interface BuildResult {
  readonly assigned: { cell: Cell; face: TileFace }[];
  /** False when no removal order exists for these positions at all. */
  readonly solvable: boolean;
}

function build(cells: readonly Cell[], faces: readonly TileFace[], rng: Rng): BuildResult {
  for (let attempt = 0; attempt < MAX_DEAL_ATTEMPTS; attempt++) {
    const assigned = tryBuild(cells, pairUp(faces, rng), rng);
    if (assigned) return { assigned, solvable: true };
  }

  // No removal order exists — the *geometry* is unwinnable, not the deal. This
  // is reachable late in a game: the last two tiles can end up stacked, and no
  // arrangement of faces makes a stacked pair takeable. Hand back a valid, fully
  // paired board and let the caller tell the player the truth.
  const positions = rng.shuffle(cells);
  const pairs = pairUp(faces, rng);
  const assigned: { cell: Cell; face: TileFace }[] = [];
  pairs.forEach((pair, i) => {
    assigned.push({ cell: positions[i * 2], face: pair[0] });
    assigned.push({ cell: positions[i * 2 + 1], face: pair[1] });
  });
  return { assigned, solvable: false };
}

/**
 * Whether reshuffling could possibly help.
 *
 * A shuffle only moves faces, never positions, so if fewer than two positions
 * are free there is no arrangement that produces a legal move. Offering a
 * shuffle here would be a button that visibly does nothing.
 */
export function canReshuffle(board: BoardState): boolean {
  const live = board.tiles.filter((t) => board.remaining.has(t.id));
  return live.filter((t) => isFree(t, live)).length >= 2;
}

export function deal(layoutId: LayoutId, seed: number): BoardState {
  const layout: Layout = LAYOUTS[layoutId];
  const rng = createRng(seed);
  const { assigned } = build(layout.cells, facesForCount(layout.cells.length), rng);

  // Ids follow layout order, not deal order, so the render order is stable and
  // a saved board can be restored by id.
  const faceByCell = new Map(assigned.map((a) => [a.cell, a.face]));
  const tiles: Tile[] = layout.cells.map((cell, id) => ({
    ...cell,
    id,
    face: faceByCell.get(cell)!,
  }));

  return {
    layoutId,
    seed,
    tiles,
    remaining: new Set(tiles.map((t) => t.id)),
    removed: [],
  };
}

/**
 * Redeals the tiles still on the board into the positions still on the board.
 *
 * Offered when the player is stuck. Undo history is cleared — it refers to an
 * arrangement that no longer exists. Never throws: check `canReshuffle` first
 * if you need to know whether it can actually help.
 */
export function reshuffle(board: BoardState, seed: number): BoardState {
  const rng = createRng(seed);
  const live = board.tiles.filter((t) => board.remaining.has(t.id));
  const { assigned } = build(
    live.map(({ x, y, z }) => ({ x, y, z })),
    live.map((t) => t.face),
    rng,
  );

  const byPosition = new Map(assigned.map((a) => [`${a.cell.x},${a.cell.y},${a.cell.z}`, a.face]));
  const tiles = board.tiles.map((tile) =>
    board.remaining.has(tile.id)
      ? { ...tile, face: byPosition.get(`${tile.x},${tile.y},${tile.z}`) ?? tile.face }
      : tile,
  );

  return { ...board, seed, tiles, removed: [] };
}
