import { describe, expect, it } from 'vitest';

import { isCovered, isFree, openSides, removePair, undoLast, type BoardState, type Tile } from '../board';
import type { Cell } from '../layouts';
import type { TileFace } from '../tiles';

const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });

describe('isFree', () => {
  it('frees a lone tile', () => {
    const a = at(0, 0);
    expect(isFree(a, [a])).toBe(true);
  });

  it('blocks a tile with neighbours on both sides', () => {
    const left = at(0, 0);
    const middle = at(1, 0);
    const right = at(2, 0);
    const all = [left, middle, right];
    expect(isFree(middle, all)).toBe(false);
    expect(isFree(left, all)).toBe(true);
    expect(isFree(right, all)).toBe(true);
  });

  it('frees a tile blocked on one side only', () => {
    const a = at(0, 0);
    const b = at(1, 0);
    expect(isFree(a, [a, b])).toBe(true);
  });

  it('ignores same-layer neighbours that do not overlap on y', () => {
    const a = at(1, 0);
    const above = at(0, 2);
    const below = at(2, 2);
    expect(isFree(a, [a, above, below])).toBe(true);
  });

  it('treats a half-offset neighbour as blocking', () => {
    const a = at(1, 0);
    const offset = at(0, 0.5);
    const other = at(2, 0.5);
    expect(isFree(a, [a, offset, other])).toBe(false);
  });

  it('blocks a covered tile even with both sides open', () => {
    const under = at(0, 0, 0);
    const over = at(0, 0, 1);
    expect(isCovered(under, [under, over])).toBe(true);
    expect(isFree(under, [under, over])).toBe(false);
    expect(isFree(over, [under, over])).toBe(true);
  });

  it('counts a partially overlapping tile above as covering', () => {
    const under = at(0, 0, 0);
    const over = at(0.5, 0.5, 1);
    expect(isFree(under, [under, over])).toBe(false);
  });

  it('does not count a tile above that misses the footprint', () => {
    const under = at(0, 0, 0);
    const over = at(1, 0, 1);
    expect(isFree(under, [under, over])).toBe(true);
  });

  it('sees through a skipped layer', () => {
    const under = at(0, 0, 0);
    const over = at(0, 0, 2);
    expect(isFree(under, [under, over])).toBe(false);
  });
});

describe('openSides', () => {
  it('reports both sides for an isolated tile', () => {
    const a = at(0, 0);
    expect(openSides(a, [a]).sort()).toEqual(['left', 'right']);
  });

  it('reports the open side of an edge tile', () => {
    const a = at(0, 0);
    const b = at(1, 0);
    expect(openSides(a, [a, b])).toEqual(['left']);
    expect(openSides(b, [a, b])).toEqual(['right']);
  });

  it('reports nothing for a covered tile', () => {
    const under = at(0, 0, 0);
    const over = at(0, 0, 1);
    expect(openSides(under, [under, over])).toEqual([]);
  });
});

const face = (suit: TileFace['suit'], rank: number): TileFace => ({ suit, rank });

function boardOf(spec: { cell: Cell; face: TileFace }[]): BoardState {
  const tiles: Tile[] = spec.map((s, id) => ({ ...s.cell, id, face: s.face }));
  return {
    layoutId: 'turtle',
    seed: 1,
    tiles,
    remaining: new Set(tiles.map((t) => t.id)),
    removed: [],
  };
}

describe('removePair', () => {
  it('removes two matching free tiles', () => {
    const board = boardOf([
      { cell: at(0, 0), face: face('circle', 5) },
      { cell: at(3, 0), face: face('circle', 5) },
    ]);
    const next = removePair(board, 0, 1);
    expect(next.remaining.size).toBe(0);
    expect(next.removed).toEqual([[0, 1]]);
  });

  it('refuses non-matching faces', () => {
    const board = boardOf([
      { cell: at(0, 0), face: face('circle', 5) },
      { cell: at(3, 0), face: face('circle', 6) },
    ]);
    expect(removePair(board, 0, 1)).toBe(board);
  });

  it('refuses a blocked tile', () => {
    const board = boardOf([
      { cell: at(0, 0), face: face('circle', 5) },
      { cell: at(1, 0), face: face('bamboo', 1) },
      { cell: at(2, 0), face: face('bamboo', 2) },
      { cell: at(1, 0, 1), face: face('circle', 5) },
    ]);
    // Tile 1 is pinned on both sides and covered.
    expect(removePair(board, 0, 3).remaining.size).toBe(2);
    expect(removePair(board, 1, 0)).toBe(board);
  });

  it('pairs any two flowers', () => {
    const board = boardOf([
      { cell: at(0, 0), face: face('flower', 1) },
      { cell: at(3, 0), face: face('flower', 3) },
    ]);
    expect(removePair(board, 0, 1).remaining.size).toBe(0);
  });

  it('does not pair a flower with a season', () => {
    const board = boardOf([
      { cell: at(0, 0), face: face('flower', 1) },
      { cell: at(3, 0), face: face('season', 1) },
    ]);
    expect(removePair(board, 0, 1)).toBe(board);
  });
});

describe('undoLast', () => {
  it('puts the last pair back', () => {
    const board = boardOf([
      { cell: at(0, 0), face: face('circle', 5) },
      { cell: at(3, 0), face: face('circle', 5) },
    ]);
    const removed = removePair(board, 0, 1);
    const restored = undoLast(removed);
    expect(restored.remaining.size).toBe(2);
    expect(restored.removed).toEqual([]);
  });

  it('is a no-op on a fresh board', () => {
    const board = boardOf([{ cell: at(0, 0), face: face('circle', 5) }]);
    expect(undoLast(board)).toBe(board);
  });
});
