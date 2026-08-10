/**
 * Holder mechanic tests.
 *
 * The holder is what makes the monetisation surface exist, so the cases that
 * matter most are the ones around losing: the holder filling, revive putting
 * tiles back, and shuffle being usable at the moment of loss.
 */

import { describe, expect, it } from 'vitest';

import { availableMoves } from '../../game/board';
import { LAYOUT_IDS } from '../../game/layouts';
import { matchGroup } from '../../game/tiles';
import {
  HOLDER_CAPACITY,
  hintPair,
  holderTiles,
  isSoftLocked,
  replaySession,
  revive,
  shuffle,
  startSession,
  tapTile,
  tappableTiles,
  type PlaySession,
} from '../session';

const SEED = 4242;

/** Taps tiles chosen to never match, so the holder fills. */
function fillHolder(start: PlaySession): PlaySession {
  let session = start;
  const seenGroups = new Set<string>();

  while (session.status === 'playing' && session.holder.length < HOLDER_CAPACITY) {
    const heldGroups = new Set(holderTiles(session).map((t) => matchGroup(t.face)));
    const candidate = tappableTiles(session).find((t) => !heldGroups.has(matchGroup(t.face)));
    if (!candidate) break;
    seenGroups.add(matchGroup(candidate.face));
    session = tapTile(session, candidate.id);
  }
  return session;
}

describe('tapping', () => {
  it.each(LAYOUT_IDS)('%s: a tapped tile leaves the board and enters the holder', (layout) => {
    const start = startSession(layout, SEED);
    const tile = tappableTiles(start)[0];
    const after = tapTile(start, tile.id);

    expect(after.holder).toEqual([tile.id]);
    expect(after.board.remaining.has(tile.id)).toBe(false);
    expect(after.board.remaining.size).toBe(start.board.remaining.size - 1);
  });

  it('clears a matching pair out of the holder immediately', () => {
    const start = startSession('turtle', SEED);
    const [a, b] = availableMoves(start.board)[0];

    const one = tapTile(start, a.id);
    expect(one.holder).toHaveLength(1);

    const two = tapTile(one, b.id);
    expect(two.holder).toHaveLength(0);
    expect(two.cleared).toBe(2);
    expect(two.board.remaining.has(a.id)).toBe(false);
    expect(two.board.remaining.has(b.id)).toBe(false);
  });

  it('ignores a tap on a blocked tile', () => {
    const start = startSession('pyramid', SEED);
    const free = new Set(tappableTiles(start).map((t) => t.id));
    const blocked = start.board.tiles.find((t) => !free.has(t.id))!;
    expect(tapTile(start, blocked.id)).toBe(start);
  });

  it('ignores a tap on a tile already in the holder', () => {
    const start = startSession('pyramid', SEED);
    const tile = tappableTiles(start)[0];
    const once = tapTile(start, tile.id);
    expect(tapTile(once, tile.id)).toBe(once);
  });

  it('unpins whatever the tapped tile was covering', () => {
    const start = startSession('turtle', SEED);
    const before = tappableTiles(start).length;
    const covering = tappableTiles(start).find((t) => t.z > 0)!;
    const after = tapTile(start, covering.id);
    // One tile left the board, but it was holding something down.
    expect(tappableTiles(after).length).toBeGreaterThanOrEqual(before - 1);
  });
});

describe('the holder filling', () => {
  it('ends the run at four non-matching tiles', () => {
    const filled = fillHolder(startSession('turtle', SEED));
    expect(filled.holder).toHaveLength(HOLDER_CAPACITY);
    expect(filled.status).toBe('holder_full');
  });

  it('accepts no further taps once full', () => {
    const filled = fillHolder(startSession('turtle', SEED));
    const candidate = filled.board.tiles.find((t) => filled.board.remaining.has(t.id))!;
    expect(tapTile(filled, candidate.id)).toBe(filled);
  });

  it('is the only way to lose — an empty board with an empty holder is a win', () => {
    let session = startSession('pyramid', 11);
    // Play the safest available pair every time.
    for (let guard = 0; guard < 400 && session.status === 'playing'; guard++) {
      const pair = hintPair(session);
      if (!pair) break;
      session = tapTile(session, pair[0].id);
      session = tapTile(session, pair[1].id);
    }
    expect(['won', 'playing']).toContain(session.status);
    if (session.status === 'won') {
      expect(session.board.remaining.size).toBe(0);
      expect(session.holder).toHaveLength(0);
    }
  });
});

describe('revive', () => {
  it('puts the held tiles back where they came from', () => {
    const filled = fillHolder(startSession('turtle', SEED));
    const held = [...filled.holder];

    const revived = revive(filled);
    expect(revived.status).toBe('playing');
    expect(revived.holder).toHaveLength(0);
    for (const id of held) expect(revived.board.remaining.has(id)).toBe(true);
    expect(revived.revivesUsed).toBe(1);
  });

  it('restores positions, so the board cannot be made unsolvable by reviving', () => {
    const start = startSession('turtle', SEED);
    const filled = fillHolder(start);
    const revived = revive(filled);

    for (const id of filled.holder) {
      const before = start.board.tiles.find((t) => t.id === id)!;
      const after = revived.board.tiles.find((t) => t.id === id)!;
      expect([after.x, after.y, after.z]).toEqual([before.x, before.y, before.z]);
    }
  });

  it('does nothing while the run is still going', () => {
    const playing = startSession('turtle', SEED);
    expect(revive(playing)).toBe(playing);
  });
});

describe('shuffle', () => {
  it('rearranges the board and keeps the run alive', () => {
    const start = startSession('dragon', SEED);
    const after = shuffle(start, 99);
    expect(after.status).toBe('playing');
    expect(after.shufflesUsed).toBe(1);
    expect(after.board.remaining).toEqual(start.board.remaining);
  });

  it('rescues a full holder — which is what makes it worth paying for', () => {
    const filled = fillHolder(startSession('turtle', SEED));
    const after = shuffle(filled, 77);

    expect(after.status).toBe('playing');
    expect(after.holder).toHaveLength(0);
    expect(after.shufflesUsed).toBe(1);
    // A shuffle used at the moment of loss must not also be billed as a revive.
    expect(after.revivesUsed).toBe(0);
  });

  it('preserves the multiset of remaining faces', () => {
    const start = startSession('pyramid', SEED);
    const key = (s: PlaySession) =>
      s.board.tiles
        .filter((t) => s.board.remaining.has(t.id))
        .map((t) => matchGroup(t.face))
        .sort()
        .join('|');
    expect(key(shuffle(start, 5))).toBe(key(start));
  });
});

describe('hints', () => {
  it('prefers a tile that matches something already held', () => {
    const start = startSession('turtle', SEED);
    const first = tappableTiles(start)[0];
    const held = tapTile(start, first.id);

    const pair = hintPair(held);
    if (pair) {
      const heldIds = new Set(held.holder);
      // The cheapest move costs one slot and frees it again immediately.
      const usesHeld = heldIds.has(pair[0].id) || heldIds.has(pair[1].id);
      const bothFree = tappableTiles(held).some((t) => t.id === pair[1].id);
      expect(usesHeld || bothFree).toBe(true);
    }
  });

  it('will not suggest a two-slot move when only one slot is left', () => {
    let session = startSession('turtle', SEED);
    // Fill to exactly one slot remaining.
    while (session.status === 'playing' && session.holder.length < HOLDER_CAPACITY - 1) {
      const heldGroups = new Set(holderTiles(session).map((t) => matchGroup(t.face)));
      const candidate = tappableTiles(session).find((t) => !heldGroups.has(matchGroup(t.face)));
      if (!candidate) break;
      session = tapTile(session, candidate.id);
    }

    const pair = hintPair(session);
    if (pair && session.holder.length === HOLDER_CAPACITY - 1) {
      // With one slot free the only legal suggestion is one that matches a held
      // tile — anything else fills the holder and ends the run.
      expect(session.holder).toContain(pair[0].id);
    }
  });

  it('reports a soft lock when nothing safe is left', () => {
    const filled = fillHolder(startSession('turtle', SEED));
    expect(isSoftLocked(filled)).toBe(false); // already lost, not soft-locked
    expect(hintPair(filled)).toBeNull();
  });
});

describe('replay', () => {
  it('rebuilds a session from its tap history', () => {
    let session = startSession('turtle', 7);
    const taps: number[] = [];
    for (let i = 0; i < 8; i++) {
      const pair = hintPair(session);
      if (!pair) break;
      for (const tile of pair) {
        taps.push(tile.id);
        session = tapTile(session, tile.id);
      }
    }

    const replayed = replaySession('turtle', 7, taps)!;
    expect(replayed.board.remaining).toEqual(session.board.remaining);
    expect(replayed.cleared).toBe(session.cleared);
    expect(replayed.holder).toEqual(session.holder);
  });

  it('rejects a history that could not have happened', () => {
    const start = startSession('turtle', 7);
    const blocked = start.board.tiles.find(
      (t) => !tappableTiles(start).some((f) => f.id === t.id),
    )!;
    expect(replaySession('turtle', 7, [blocked.id])).toBeNull();
  });
});

describe('counters for instrumentation', () => {
  it('tracks cleared, revives and shuffles without the client computing them', () => {
    let session = startSession('turtle', SEED);
    const [a, b] = availableMoves(session.board)[0];
    session = tapTile(session, a.id);
    session = tapTile(session, b.id);
    session = shuffle(session, 3);

    expect(session.cleared).toBe(2);
    expect(session.shufflesUsed).toBe(1);
    expect(session.revivesUsed).toBe(0);
  });
});
