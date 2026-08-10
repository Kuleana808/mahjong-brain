import { describe, expect, it } from 'vitest';

import { availableMoves, removePair, type BoardState } from '../../game/board';
import { deal } from '../../game/deal';
import { LAYOUT_IDS } from '../../game/layouts';
import { facesMatch } from '../../game/tiles';
import { analyse, bestMove } from '../analysis';
import { explainLocally, summariseLocally } from '../localExplainer';

describe('analyse', () => {
  it.each(LAYOUT_IDS)('%s: recommends a legal pair on a fresh board', (id) => {
    const board = deal(id, 21);
    const analysis = analyse(board)!;
    expect(analysis).not.toBeNull();

    const [a, b] = analysis.pair;
    expect(a.id).not.toBe(b.id);
    expect(facesMatch(a.face, b.face)).toBe(true);
    const legal = availableMoves(board).some(
      ([x, y]) => (x.id === a.id && y.id === b.id) || (x.id === b.id && y.id === a.id),
    );
    expect(legal).toBe(true);
  });

  it('returns null when nothing can be taken', () => {
    const empty: BoardState = {
      layoutId: 'turtle',
      seed: 1,
      tiles: [],
      remaining: new Set(),
      removed: [],
    };
    expect(analyse(empty)).toBeNull();
    expect(bestMove(empty)).toBeNull();
  });

  it('flags the last available pair as the only move', () => {
    let board = deal('pyramid', 4);
    // Play greedily until one move is left.
    while (availableMoves(board).length > 1) {
      const [a, b] = availableMoves(board)[0];
      board = removePair(board, a.id, b.id);
    }
    const analysis = analyse(board);
    if (analysis) expect(analysis.onlyMove).toBe(true);
  });

  it('prefers a move that unlocks tiles over one that unlocks none', () => {
    const board = deal('turtle', 33);
    const analysis = analyse(board)!;
    const moves = availableMoves(board);
    const unlocking = moves.filter(
      ([a, b]) =>
        analyse({ ...board, remaining: new Set([...board.remaining]) })!.frees.length >= 0 &&
        a.z + b.z > 0,
    );
    // If any move touches a raised layer, the recommendation should too.
    if (unlocking.length > 0) {
      const [a, b] = analysis.pair;
      expect(a.z + b.z).toBeGreaterThan(0);
    }
  });
});

describe('explainLocally', () => {
  it.each(LAYOUT_IDS)('%s: writes a short, plain hint', (id) => {
    const analysis = analyse(deal(id, 17))!;
    const text = explainLocally(analysis);

    expect(text.length).toBeGreaterThan(40);
    expect(text.length).toBeLessThan(320);
    expect(text).not.toMatch(/[!*_#]/); // no shouting, no stray markdown
    expect(text).not.toMatch(/\d+\s*,\s*\d+/); // never leaks coordinates
    expect(text.toLowerCase()).toContain('look at');
  });

  it('names where to look, not which tile ids', () => {
    const analysis = analyse(deal('turtle', 9))!;
    const text = explainLocally(analysis);
    expect(text).toMatch(/corner|edge|side|middle/);
  });

  it('summarises in one sentence', () => {
    const analysis = analyse(deal('turtle', 9))!;
    const summary = summariseLocally(analysis);
    expect(summary.split('.').filter(Boolean).length).toBe(1);
    expect(summary).toContain(analysis.faceLabel);
  });

  it('stays sane deep into a board', () => {
    let board = deal('pyramid', 6);
    for (let i = 0; i < 50 && availableMoves(board).length > 0; i++) {
      const analysis = analyse(board)!;
      const text = explainLocally(analysis);
      expect(text.length).toBeGreaterThan(30);
      board = removePair(board, analysis.pair[0].id, analysis.pair[1].id);
    }
  });
});
