/**
 * Board state and the rules of solitaire mahjong.
 *
 * A tile is *free* when nothing rests on top of it and at least one of its long
 * sides is open, so it can slide out sideways. Two free tiles whose faces share
 * a match group may be removed together.
 *
 * Everything here is pure. The store owns mutation; this module only computes.
 */

import type { Cell, Layout } from './layouts';
import { facesMatch, type TileFace } from './tiles';

export interface Tile extends Cell {
  readonly id: number;
  readonly face: TileFace;
}

export interface BoardState {
  readonly layoutId: Layout['id'];
  readonly seed: number;
  /** Every tile dealt, in deal order. Never mutated. */
  readonly tiles: readonly Tile[];
  /** Ids still on the board. */
  readonly remaining: ReadonlySet<number>;
  /** Removed pairs, newest last. Drives undo. */
  readonly removed: readonly (readonly [number, number])[];
}

/** Tiles overlap on the x axis when their 1.0-wide footprints intersect. */
function overlaps1D(a: number, b: number): boolean {
  return a < b + 1 && b < a + 1;
}

function sameFootprintColumn(a: Cell, b: Cell): boolean {
  return overlaps1D(a.x, b.x) && overlaps1D(a.y, b.y);
}

/**
 * Something rests on this tile.
 *
 * Checks every higher layer rather than only z+1: layouts may legally skip a
 * layer over a gap, and a wrong answer here is a tile the player can pick up
 * through another tile.
 */
export function isCovered(tile: Cell, others: Iterable<Cell>): boolean {
  for (const other of others) {
    if (other === tile) continue;
    if (other.z > tile.z && sameFootprintColumn(tile, other)) return true;
  }
  return false;
}

/**
 * A side is blocked when a same-layer tile sits against it. The `> x - 2` test
 * catches half-offset neighbours, which touch without sharing an origin.
 */
function sideBlocked(tile: Cell, others: Iterable<Cell>, side: 'left' | 'right'): boolean {
  for (const other of others) {
    if (other === tile) continue;
    if (other.z !== tile.z) continue;
    if (!overlaps1D(tile.y, other.y)) continue;
    if (side === 'left' && other.x < tile.x && other.x > tile.x - 2) return true;
    if (side === 'right' && other.x > tile.x && other.x < tile.x + 2) return true;
  }
  return false;
}

export function isFree(tile: Cell, others: Iterable<Cell>): boolean {
  if (isCovered(tile, others)) return false;
  return !sideBlocked(tile, others, 'left') || !sideBlocked(tile, others, 'right');
}

/** Which side(s) a free tile can slide out of. Used by the hint coach. */
export function openSides(tile: Cell, others: Iterable<Cell>): ('left' | 'right')[] {
  if (isCovered(tile, others)) return [];
  const sides: ('left' | 'right')[] = [];
  if (!sideBlocked(tile, others, 'left')) sides.push('left');
  if (!sideBlocked(tile, others, 'right')) sides.push('right');
  return sides;
}

export function remainingTiles(board: BoardState): Tile[] {
  return board.tiles.filter((t) => board.remaining.has(t.id));
}

export function freeTiles(board: BoardState): Tile[] {
  const live = remainingTiles(board);
  return live.filter((t) => isFree(t, live));
}

/** Every pair the player could legally take right now. */
export function availableMoves(board: BoardState): [Tile, Tile][] {
  const free = freeTiles(board);
  const moves: [Tile, Tile][] = [];
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (facesMatch(free[i].face, free[j].face)) moves.push([free[i], free[j]]);
    }
  }
  return moves;
}

export function canPair(board: BoardState, aId: number, bId: number): boolean {
  if (aId === bId) return false;
  const live = remainingTiles(board);
  const a = live.find((t) => t.id === aId);
  const b = live.find((t) => t.id === bId);
  if (!a || !b) return false;
  if (!facesMatch(a.face, b.face)) return false;
  return isFree(a, live) && isFree(b, live);
}

export function removePair(board: BoardState, aId: number, bId: number): BoardState {
  if (!canPair(board, aId, bId)) return board;
  const remaining = new Set(board.remaining);
  remaining.delete(aId);
  remaining.delete(bId);
  return { ...board, remaining, removed: [...board.removed, [aId, bId] as const] };
}

export function undoLast(board: BoardState): BoardState {
  const last = board.removed.at(-1);
  if (!last) return board;
  const remaining = new Set(board.remaining);
  remaining.add(last[0]);
  remaining.add(last[1]);
  return { ...board, remaining, removed: board.removed.slice(0, -1) };
}

export function isComplete(board: BoardState): boolean {
  return board.remaining.size === 0;
}

/** No legal move and tiles left over — the board needs a reshuffle. */
export function isStuck(board: BoardState): boolean {
  return board.remaining.size > 0 && availableMoves(board).length === 0;
}

/**
 * How many tiles this one is holding down.
 *
 * Feeds the hint explanation: "these two are pinning three tiles below" is the
 * teachable part, not "here is a pair".
 */
export function tilesFreedBy(board: BoardState, ids: readonly number[]): Tile[] {
  const before = new Set(freeTiles(board).map((t) => t.id));
  const after = board.tiles.filter((t) => board.remaining.has(t.id) && !ids.includes(t.id));
  return after.filter((t) => !before.has(t.id) && isFree(t, after));
}
