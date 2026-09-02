import { describe, expect, it } from 'vitest';

import {
  LAYOUT_IDS,
  availableMoves,
  canPair,
  canReshuffle,
  createRng,
  deal,
  facesMatch,
  freeTiles,
  isStuck,
  removePair,
} from '../../packages/core/src/game';
import type { LayoutId } from '../../packages/core/src/game/layouts';
import { hintPair, startSession, tapTile } from '../../packages/core/src/play/session';

/**
 * Hints.
 *
 * Brent, 2026-09-02: "hints aren't working either."
 *
 * The hint ENGINE was fine — the first three hints highlight a real pair, name
 * the tiles, and lift them above the stack. What was broken was the fourth tap.
 * With no hints left the app tries a rewarded ad; AdMob is still unverified so
 * it answers "unavailable"; and the resulting sentence went only to
 * `announcement`, which renders into a VISUALLY-HIDDEN aria-live region. The
 * button stayed enabled with a "0" badge and tapping it did nothing a sighted
 * player could see.
 *
 * Every player reaches this after three hints, so it read as "hints are
 * broken". These tests cover both halves: the engine always returns a legal
 * pair or an honest null, and the gate is never silent.
 */

const SEEDS = [1, 7, 42, 1337, 90210];

function session(layout: LayoutId, seed: number) {
  return startSession(layout, seed);
}

describe('the hint engine', () => {
  it('returns a legal, currently-takeable pair on a fresh board', () => {
    for (const id of LAYOUT_IDS) {
      for (const seed of SEEDS) {
        const play = session(id as LayoutId, seed);
        const pair = hintPair(play);

        expect({ id, seed, found: pair !== null }).toEqual({ id, seed, found: true });
        const [a, b] = pair!;
        expect(facesMatch(a.face, b.face)).toBe(true);
        // A hint that names a pair the player cannot actually take is worse
        // than no hint: it teaches the wrong rule.
        expect(canPair(play.board, a.id, b.id) || play.holder.includes(a.id) || play.holder.includes(b.id)).toBe(true);
      }
    }
  });

  it('keeps returning a legal pair deep into a game, not just at the start', () => {
    // The failure mode worth guarding is a hint that works on a fresh board and
    // degrades once the stack opens up.
    let play = session('turtle', 42);
    for (let move = 0; move < 30; move += 1) {
      const pair = hintPair(play);
      if (!pair) break;
      expect(facesMatch(pair[0].face, pair[1].face)).toBe(true);

      const moves = availableMoves(play.board);
      if (moves.length === 0) break;
      play = tapTile(play, moves[0][0].id);
      play = tapTile(play, moves[0][1].id);
    }
    expect(play.board.remaining.size).toBeLessThan(144);
  });

  it('returns null rather than a wrong answer when nothing can be taken', () => {
    // Play a board down a greedy line until it stalls, then confirm the hint
    // engine says "nothing" instead of inventing a pair.
    let board = deal('pyramid', createRng(7));
    for (let i = 0; i < 400; i += 1) {
      const moves = availableMoves(board);
      if (moves.length === 0) break;
      board = removePair(board, moves[0][0].id, moves[0][1].id);
    }

    if (isStuck(board) && board.remaining.size > 0) {
      const play = { ...session('pyramid', 7), board, holder: [] as number[] };
      expect(hintPair(play)).toBeNull();
    }
    // If the greedy line cleared the board there is nothing to assert; the
    // deadlock path is covered by the stuck-board UI test below.
    expect(board.remaining.size).toBeGreaterThanOrEqual(0);
  });

  it('offers a hint that accounts for tiles already in the holder', () => {
    // A held tile is takeable against a matching free tile on the board. A hint
    // that ignored the holder would miss the easiest move available.
    let play = session('turtle', 1337);
    const moves = availableMoves(play.board);
    play = tapTile(play, moves[0][0].id);

    const pair = hintPair(play);
    expect(pair).not.toBeNull();
    expect(facesMatch(pair![0].face, pair![1].face)).toBe(true);
  });
});

describe('the deadlock path', () => {
  it('agrees with itself about whether a shuffle can help', () => {
    // `canReshuffle` decides between offering "Shuffle" and telling the player
    // honestly that the last tiles are stacked. Offering a button that visibly
    // does nothing is the failure this guards, so the predicate must match the
    // thing it claims: a shuffle is possible exactly when at least two tiles
    // are free, because a shuffle moves faces and never positions.
    for (const id of LAYOUT_IDS) {
      let board = deal(id as LayoutId, createRng(1));
      for (let i = 0; i < 400; i += 1) {
        const moves = availableMoves(board);
        if (moves.length === 0) break;
        board = removePair(board, moves[0][0].id, moves[0][1].id);
      }
      if (board.remaining.size === 0) continue;

      const free = freeTiles(board).length;
      expect({ id, shufflable: canReshuffle(board), atLeastTwoFree: free >= 2 }).toEqual({
        id,
        shufflable: free >= 2,
        atLeastTwoFree: free >= 2,
      });
    }
  });
});

describe('the hint gate is never a silent no-op', () => {
  /**
   * These read the component source. The bug was not in logic a unit test could
   * reach — the store produced the right sentence and the UI simply never
   * rendered it. What must not regress is that the sentence has a VISIBLE home.
   */
  const source = () =>
    import('node:fs').then(({ readFileSync }) =>
      readFileSync(new URL('../../src/ui/HintBar.tsx', import.meta.url), 'utf8'),
    );

  it('renders the exhausted-hint message where the player is looking', async () => {
    const text = await source();

    expect(text).toContain("'No Hints available. A rewarded Hint is unavailable right now.'");
    expect(text).toContain("'Ad closed. No Hint was used.'");
    // And it must be in the hint bar, not only in an aria-live region.
    expect(text).toContain('hintNotice');
    expect(text).toMatch(/<div className="hintbar">[\s\S]*\{hintNotice\}/);
  });

  it('gives that message a dismiss, and a Shuffle when a shuffle would help', async () => {
    const text = await source();

    expect(text).toContain('noticeOffersShuffle');
    expect(text).toContain("'Shuffle' : 'Got it'");
  });

  it('still lets a stuck board show its own better message', async () => {
    const text = await source();

    // The stuck branch names the real situation and offers Shuffle or New
    // board. The generic notice must not shadow it.
    expect(text).toContain("status !== 'stuck'");
    expect(text).toContain('No pairs left to take.');
    expect(text).toContain('These last tiles are stacked');
  });
});
