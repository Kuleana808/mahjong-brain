import { describe, expect, it } from 'vitest';

import {
  LAYOUTS,
  LAYOUT_IDS,
  availableMoves,
  canPair,
  createRng,
  deal,
  facesMatch,
  freeTiles,
  isComplete,
  isCovered,
  isFree,
  isStuck,
  matchGroup,
  removePair,
  canReshuffle,
  reshuffle,
  standardSet,
  undoLast,
} from '../../packages/core/src/game';
import type { LayoutId } from '../../packages/core/src/game/layouts';

/**
 * Production gameplay QA — tiles.
 *
 * Written against the checklist Brent gave on 2026-09-02 after reporting that
 * "some of the tiles and the audio were weird" in past builds. Results are
 * recorded in PROD_QA_LOG.md at the repo root.
 *
 * Every board here is dealt with a FIXED seed so a failure is reproducible.
 * Several of these walk a full board to completion rather than asserting on a
 * hand-built fixture, because the failure modes that reach players are the ones
 * that only appear a hundred moves in.
 */

const SEEDS = [1, 7, 42, 1337, 90210];

function board(layout: LayoutId, seed: number) {
  return deal(layout, createRng(seed));
}

// ── 1. The tile set itself ────────────────────────────────────────────────

describe('the tile set', () => {
  it('is the standard 144-tile set with the right composition', () => {
    const set = standardSet();
    expect(set).toHaveLength(144);

    const count = (predicate: (f: (typeof set)[number]) => boolean) =>
      set.filter(predicate).length;

    // 3 numbered suits x 9 ranks x 4 copies
    for (const suit of ['bamboo', 'character', 'circle'] as const) {
      expect(count((f) => f.suit === suit)).toBe(36);
      for (let rank = 1; rank <= 9; rank += 1) {
        expect(count((f) => f.suit === suit && f.rank === rank)).toBe(4);
      }
    }
    expect(count((f) => f.suit === 'wind')).toBe(16); // 4 winds x 4
    expect(count((f) => f.suit === 'dragon')).toBe(12); // 3 dragons x 4
    expect(count((f) => f.suit === 'flower')).toBe(4); // 1 each
    expect(count((f) => f.suit === 'season')).toBe(4); // 1 each
  });

  it('gives every face a distinct, non-empty, human-readable name', async () => {
    const { faceName } = await import('../../packages/core/src/game/tiles');
    const names = standardSet().map(faceName);

    for (const name of names) {
      expect(name.trim().length).toBeGreaterThan(0);
      // A missing lookup would render "undefined Wind" or similar.
      expect(name).not.toMatch(/undefined|null|NaN/);
    }
    // 34 distinct faces in a standard set (27 numbered + 4 winds + 3 dragons)
    // plus 4 flowers and 4 seasons named individually.
    expect(new Set(names).size).toBe(42);
  });
});

// ── 2. Matching rules ─────────────────────────────────────────────────────

describe('matching rules', () => {
  it('pairs numbered suits only on an exact suit and rank', () => {
    expect(facesMatch({ suit: 'bamboo', rank: 3 }, { suit: 'bamboo', rank: 3 })).toBe(true);
    expect(facesMatch({ suit: 'bamboo', rank: 3 }, { suit: 'bamboo', rank: 4 })).toBe(false);
    expect(facesMatch({ suit: 'bamboo', rank: 3 }, { suit: 'circle', rank: 3 })).toBe(false);
    expect(facesMatch({ suit: 'character', rank: 9 }, { suit: 'circle', rank: 9 })).toBe(false);
  });

  it('pairs winds and dragons only with the same wind or dragon', () => {
    expect(facesMatch({ suit: 'wind', rank: 1 }, { suit: 'wind', rank: 1 })).toBe(true);
    expect(facesMatch({ suit: 'wind', rank: 1 }, { suit: 'wind', rank: 2 })).toBe(false);
    expect(facesMatch({ suit: 'dragon', rank: 2 }, { suit: 'dragon', rank: 2 })).toBe(true);
    expect(facesMatch({ suit: 'dragon', rank: 1 }, { suit: 'dragon', rank: 3 })).toBe(false);
    // A wind never matches a dragon even at the same rank.
    expect(facesMatch({ suit: 'wind', rank: 1 }, { suit: 'dragon', rank: 1 })).toBe(false);
  });

  it('pairs any flower with any flower and any season with any season', () => {
    // The traditional bonus-tile rule, and the one thing that surprises new
    // players. Getting this wrong strands four unmatchable tiles on the board.
    expect(facesMatch({ suit: 'flower', rank: 1 }, { suit: 'flower', rank: 4 })).toBe(true);
    expect(facesMatch({ suit: 'season', rank: 2 }, { suit: 'season', rank: 3 })).toBe(true);
    // But a flower never matches a season.
    expect(facesMatch({ suit: 'flower', rank: 1 }, { suit: 'season', rank: 1 })).toBe(false);
    expect(matchGroup({ suit: 'flower', rank: 1 })).toBe('flower');
    expect(matchGroup({ suit: 'season', rank: 4 })).toBe('season');
  });

  it('is symmetric and reflexive across the whole set', () => {
    const faces = standardSet();
    for (const a of faces) {
      expect(facesMatch(a, a)).toBe(true);
      for (const b of faces) {
        expect(facesMatch(a, b)).toBe(facesMatch(b, a));
      }
    }
  });
});

// ── 3. Free-tile detection ────────────────────────────────────────────────

describe('free-tile detection', () => {
  const cell = (x: number, y: number, z: number) => ({ x, y, z });

  it('treats a lone tile as free', () => {
    const solo = cell(0, 0, 0);
    expect(isFree(solo, [solo])).toBe(true);
  });

  it('blocks a tile covered from any higher layer, not only the next one', () => {
    // A layout may skip a layer over a gap. Checking only z+1 would let the
    // player lift a tile out from under another one.
    const under = cell(0, 0, 0);
    const twoAbove = cell(0, 0, 2);
    expect(isCovered(under, [under, twoAbove])).toBe(true);
    expect(isFree(under, [under, twoAbove])).toBe(false);
  });

  it('frees a tile blocked on one side only', () => {
    const middle = cell(2, 0, 0);
    const left = cell(0, 0, 0);
    expect(isFree(middle, [middle, left])).toBe(true);
  });

  it('blocks a tile squeezed on both sides', () => {
    // Tiles occupy exactly 1.0, so the adjacent columns are x-1 and x+1.
    const middle = cell(2, 0, 0);
    expect(isFree(middle, [middle, cell(1, 0, 0), cell(3, 0, 0)])).toBe(false);
  });

  it('counts a half-offset neighbour as touching', () => {
    // Half-step offsets overlap without sharing an origin. Missing this makes
    // visibly-blocked tiles selectable.
    const middle = cell(2, 0, 0);
    expect(isFree(middle, [middle, cell(1.5, 0, 0), cell(2.5, 0, 0)])).toBe(false);
  });

  it('does not treat a tile a full gap away as blocking', () => {
    // x-2 leaves a clear 1.0 gap. Counting it would wrongly strand tiles.
    const middle = cell(2, 0, 0);
    expect(isFree(middle, [middle, cell(0, 0, 0), cell(4, 0, 0)])).toBe(true);
  });

  it('ignores neighbours on a different row', () => {
    const middle = cell(2, 0, 0);
    const otherRow = cell(1, 5, 0);
    expect(isFree(middle, [middle, otherRow])).toBe(true);
  });

  it('ignores neighbours on a different layer for side blocking', () => {
    const middle = cell(2, 0, 0);
    const besideButAbove = cell(1, 0, 1);
    // Above and offset: it does not share the footprint column, so it does not
    // cover, and it is not on the same layer, so it does not block a side.
    expect(isFree(middle, [middle, besideButAbove])).toBe(true);
  });

  it('always leaves at least one free tile on a fresh board', () => {
    for (const id of LAYOUT_IDS) {
      for (const seed of SEEDS) {
        expect(freeTiles(board(id as LayoutId, seed)).length).toBeGreaterThan(0);
      }
    }
  });
});

// ── 4/5. Pair removal and undo ────────────────────────────────────────────

describe('removing and undoing', () => {
  it('refuses a pair that is not actually a pair', () => {
    const state = board('turtle', 42);
    const free = freeTiles(state);
    const mismatch = free.find((t) => !facesMatch(t.face, free[0].face) && t.id !== free[0].id);
    if (mismatch) expect(canPair(state, free[0].id, mismatch.id)).toBe(false);
    // A tile never pairs with itself.
    expect(canPair(state, free[0].id, free[0].id)).toBe(false);
  });

  it('refuses a pair when either tile is blocked', () => {
    const state = board('turtle', 42);
    const freeIds = new Set(freeTiles(state).map((t) => t.id));
    const blocked = state.tiles.find((t) => !t.removed && !freeIds.has(t.id));
    const openMatch = freeTiles(state).find((t) => blocked && facesMatch(t.face, blocked.face));
    if (blocked && openMatch) expect(canPair(state, openMatch.id, blocked.id)).toBe(false);
  });

  it('restores the exact prior state on undo', () => {
    const state = board('turtle', 7);
    const [a, b] = availableMoves(state)[0];

    const after = removePair(state, a.id, b.id);
    expect(after.remaining.size).toBe(state.remaining.size - 2);

    const undone = undoLast(after);
    const ids = (s: typeof state) => [...s.remaining].sort((x, y) => x - y);
    expect(ids(undone)).toEqual(ids(state));
    expect(undone.removed).toHaveLength(state.removed.length);
    // The restored tiles are free again, so play can continue from here.
    const freeIds = (s: typeof state) => freeTiles(s).map((t) => t.id).sort((x, y) => x - y);
    expect(freeIds(undone)).toEqual(freeIds(state));
  });

  it('is a no-op when there is nothing to undo', () => {
    const state = board('turtle', 7);
    expect(undoLast(state).remaining.size).toBe(state.remaining.size);
  });
});

// ── 6/7. Hints, deadlock and solvability ──────────────────────────────────

describe('hints and deadlock', () => {
  it('offers a hint that is a genuinely legal move', () => {
    for (const seed of SEEDS) {
      const state = board('turtle', seed);
      const moves = availableMoves(state);
      expect(moves.length).toBeGreaterThan(0);
      for (const [a, b] of moves) {
        expect(facesMatch(a.face, b.face)).toBe(true);
        expect(canPair(state, a.id, b.id)).toBe(true);
      }
    }
  });

  it('never reports stuck while a move exists, and vice versa', () => {
    for (const id of LAYOUT_IDS) {
      let state = board(id as LayoutId, 42);
      for (let move = 0; move < 40 && !isComplete(state); move += 1) {
        const moves = availableMoves(state);
        expect(isStuck(state)).toBe(moves.length === 0);
        if (moves.length === 0) break;
        state = removePair(state, moves[0][0].id, moves[0][1].id);
      }
    }
  });

  it('never strands the player: a stuck board can always be reshuffled or is honestly unwinnable', () => {
    // Brent's #7. Deadlock must be DETECTED and RECOVERABLE, never silent.
    //
    // Note on solvability: every deal is solvable by construction — the dealer
    // builds the board backwards by repeatedly removing currently-free pairs,
    // so replaying that construction is a winning line. That order is not
    // recoverable from public board state, and proving solvability by search is
    // not practical (mahjong solitaire is NP-hard; a heuristic search with a
    // 200k-node budget does not clear a 144-tile board). So this asserts the
    // property that actually protects the player: they are never stuck with no
    // way forward and no explanation.
    for (const id of LAYOUT_IDS) {
      for (const seed of SEEDS) {
        let state = board(id as LayoutId, seed);

        // Play a long greedy line, which is exactly how a real player paints
        // themselves into a corner.
        for (let move = 0; move < 200 && !isComplete(state); move += 1) {
          const moves = availableMoves(state);
          if (moves.length === 0) break;
          state = removePair(state, moves[0][0].id, moves[0][1].id);
        }

        if (isComplete(state)) continue;

        if (isStuck(state)) {
          // Stuck. Either a reshuffle is offered and produces a playable board,
          // or the geometry genuinely cannot be played and canReshuffle says so
          // rather than showing a button that does nothing.
          if (canReshuffle(state)) {
            const shuffled = reshuffle(state, createRng(seed + 1));
            expect({
              id,
              seed,
              tiles: shuffled.remaining.size,
            }).toEqual({ id, seed, tiles: state.remaining.size });
            expect(freeTiles(shuffled).length).toBeGreaterThanOrEqual(2);
          } else {
            // Fewer than two free positions: no arrangement of faces helps.
            expect(freeTiles(state).length).toBeLessThan(2);
          }
        }
      }
    }
  });
});

// ── 9. Layout integrity ───────────────────────────────────────────────────

describe('board layouts', () => {
  it('has an even tile count in every layout, so nothing is left unmatchable', () => {
    for (const id of LAYOUT_IDS) {
      const layout = LAYOUTS[id as LayoutId];
      expect({ id, even: layout.cells.length % 2 === 0 }).toEqual({ id, even: true });
    }
  });

  it('never places two tiles in the same position', () => {
    for (const id of LAYOUT_IDS) {
      const layout = LAYOUTS[id as LayoutId];
      const keys = layout.cells.map((c) => `${c.x},${c.y},${c.z}`);
      expect({ id, unique: new Set(keys).size }).toEqual({ id, unique: keys.length });
    }
  });

  it('never floats a tile on a layer with nothing under it', () => {
    // A tile hanging in mid-air renders as though it were resting on the
    // board, which makes the stack impossible to read.
    for (const id of LAYOUT_IDS) {
      const layout = LAYOUTS[id as LayoutId];
      const occupied = new Set(layout.cells.map((c) => `${c.x},${c.y},${c.z}`));
      for (const cell of layout.cells) {
        if (cell.z === 0) continue;
        // Same footprint rule the engine uses: tiles are 1.0 x 1.0.
        const overlaps = (a: number, b: number) => a < b + 1 && b < a + 1;
        const supported = layout.cells.some(
          (other) =>
            other.z === cell.z - 1 &&
            overlaps(other.x, cell.x) &&
            overlaps(other.y, cell.y),
        );
        expect({ id, cell: `${cell.x},${cell.y},${cell.z}`, supported }).toEqual({
          id,
          cell: `${cell.x},${cell.y},${cell.z}`,
          supported: true,
        });
      }
      expect(occupied.size).toBe(layout.cells.length);
    }
  });

  it('deals every layout with matched pairs and no leftovers', () => {
    for (const id of LAYOUT_IDS) {
      for (const seed of SEEDS) {
        const state = board(id as LayoutId, seed);
        const groups = new Map<string, number>();
        for (const tile of state.tiles) {
          const key = matchGroup(tile.face);
          groups.set(key, (groups.get(key) ?? 0) + 1);
        }
        for (const [key, count] of groups) {
          expect({ id, key, even: count % 2 === 0 }).toEqual({ id, key, even: true });
        }
      }
    }
  });
});
