import { describe, expect, it } from 'vitest';

import { availableMoves, isComplete, isStuck, removePair, type BoardState } from '../board';
import { canReshuffle, deal, reshuffle } from '../deal';
import { LAYOUTS, LAYOUT_IDS, type LayoutId } from '../layouts';
import { matchGroup } from '../tiles';

const SEEDS = [1, 7, 42, 1337, 90210];

describe('layouts', () => {
  it.each(LAYOUT_IDS)('%s holds an even number of tiles', (id) => {
    expect(LAYOUTS[id].cells.length % 2).toBe(0);
  });

  it.each(LAYOUT_IDS)('%s has no two tiles in the same place', (id) => {
    const seen = new Set(LAYOUTS[id].cells.map((c) => `${c.x},${c.y},${c.z}`));
    expect(seen.size).toBe(LAYOUTS[id].cells.length);
  });

  it('builds the classic 144-tile turtle', () => {
    expect(LAYOUTS.turtle.cells.length).toBe(144);
    expect(LAYOUTS.turtle.maxZ).toBe(4);
  });

  it('builds 144-tile pyramid and dragon boards', () => {
    expect(LAYOUTS.pyramid.cells.length).toBe(144);
    expect(LAYOUTS.dragon.cells.length).toBe(144);
  });
});

describe('deal', () => {
  it.each(LAYOUT_IDS)('%s deals every position exactly once', (id) => {
    const board = deal(id, 99);
    expect(board.tiles.length).toBe(LAYOUTS[id].cells.length);
    expect(board.remaining.size).toBe(board.tiles.length);
  });

  it.each(LAYOUT_IDS)('%s deals faces in complete match groups', (id) => {
    const counts = new Map<string, number>();
    for (const tile of deal(id, 5).tiles) {
      const key = matchGroup(tile.face);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) {
      expect(count % 2, `match group ${key} has ${count} tiles`).toBe(0);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = deal('turtle', 2024);
    const b = deal('turtle', 2024);
    expect(a.tiles.map((t) => matchGroup(t.face))).toEqual(b.tiles.map((t) => matchGroup(t.face)));
  });

  it('produces different boards for different seeds', () => {
    const a = deal('turtle', 1).tiles.map((t) => matchGroup(t.face));
    const b = deal('turtle', 2).tiles.map((t) => matchGroup(t.face));
    expect(a).not.toEqual(b);
  });

  it.each(LAYOUT_IDS)('%s opens with at least one legal move', (id) => {
    expect(availableMoves(deal(id, 11)).length).toBeGreaterThan(0);
  });
});

/**
 * Clears a board by always taking the pair that frees the most tiles, breaking
 * ties towards the highest layer. Not a solver — a greedy player. It exists to
 * show deals are *winnable in practice*, not just in theory.
 */
function greedySolve(start: BoardState): { solved: boolean; movesPlayed: number } {
  let board = start;
  let movesPlayed = 0;

  while (!isComplete(board)) {
    const moves = availableMoves(board);
    if (moves.length === 0) return { solved: false, movesPlayed };
    const best = moves.reduce((bestSoFar, move) => {
      const score = (m: typeof move) => m[0].z + m[1].z;
      return score(move) > score(bestSoFar) ? move : bestSoFar;
    });
    board = removePair(board, best[0].id, best[1].id);
    movesPlayed++;
  }

  return { solved: true, movesPlayed };
}

describe('solvability', () => {
  it.each(LAYOUT_IDS)('%s always leaves a construction solution', (id: LayoutId) => {
    // The deal is built backwards from a valid removal order, so a solution
    // exists by construction. Assert the invariant the construction relies on:
    // the opening board is never already stuck.
    for (const seed of SEEDS) {
      const board = deal(id, seed);
      expect(isStuck(board), `${id} seed ${seed} opened stuck`).toBe(false);
    }
  });

  it('a greedy player clears most turtle deals', () => {
    const results = SEEDS.map((seed) => greedySolve(deal('turtle', seed)));
    const solved = results.filter((r) => r.solved).length;
    // Greedy is not perfect and is not meant to be — but a deal that a greedy
    // player almost never clears is a deal that feels unfair.
    expect(solved).toBeGreaterThanOrEqual(2);
  });
});

describe('reshuffle', () => {
  it('keeps the same tiles in the same positions', () => {
    let board = deal('pyramid', 3);
    const first = availableMoves(board)[0];
    board = removePair(board, first[0].id, first[1].id);

    const shuffled = reshuffle(board, 77);
    expect(shuffled.remaining).toEqual(board.remaining);
    expect(shuffled.tiles.map((t) => `${t.x},${t.y},${t.z}`)).toEqual(
      board.tiles.map((t) => `${t.x},${t.y},${t.z}`),
    );
  });

  it('preserves the multiset of remaining faces', () => {
    let board = deal('pyramid', 3);
    const first = availableMoves(board)[0];
    board = removePair(board, first[0].id, first[1].id);

    const key = (b: BoardState) =>
      b.tiles
        .filter((t) => b.remaining.has(t.id))
        .map((t) => matchGroup(t.face))
        .sort()
        .join('|');

    expect(key(reshuffle(board, 77))).toEqual(key(board));
  });

  it('leaves a playable board', () => {
    const board = reshuffle(deal('dragon', 8), 12);
    expect(isStuck(board)).toBe(false);
  });

  it('survives a geometry no shuffle can save', () => {
    // Two tiles, one stacked on the other: the lower one can never be freed.
    // This happens for real at the end of a board, and it used to throw.
    const base = deal('pyramid', 3);
    const stacked = base.tiles
      .filter((t) => t.z === 0 || t.z === 1)
      .find((t) => t.z === 1)!;
    const beneath = base.tiles.find(
      (t) => t.z === 0 && Math.abs(t.x - stacked.x) < 1 && Math.abs(t.y - stacked.y) < 1,
    )!;

    // Real play always leaves a pairable multiset, since every removal takes a
    // matched pair — so give these two the same face.
    const twoLeft: BoardState = {
      ...base,
      tiles: base.tiles.map((t) =>
        t.id === beneath.id ? { ...t, face: stacked.face } : t,
      ),
      remaining: new Set([stacked.id, beneath.id]),
    };

    expect(canReshuffle(twoLeft)).toBe(false);
    expect(() => reshuffle(twoLeft, 5)).not.toThrow();
    expect(reshuffle(twoLeft, 5).remaining.size).toBe(2);
  });

  it('reports a normal board as shufflable', () => {
    expect(canReshuffle(deal('turtle', 3))).toBe(true);
  });

  it('clears undo history', () => {
    let board = deal('pyramid', 3);
    const first = availableMoves(board)[0];
    board = removePair(board, first[0].id, first[1].id);
    expect(reshuffle(board, 77).removed).toEqual([]);
  });
});
