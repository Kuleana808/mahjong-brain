/**
 * Holder-based play — the parity mechanic.
 *
 * PARITY NOTE (D-015). The engine originally shipped classic direct-pair
 * solitaire: tap two free tiles, they clear. The incumbent's loop is different
 * and this module implements theirs:
 *
 *   1. Tap a free tile. It leaves the board and goes into a holder.
 *   2. Any two tiles in the holder that match clear immediately.
 *   3. The holder has four slots. Fill all four with no match and the run ends.
 *
 * That third rule is the entire monetisation surface — a full holder is the
 * moment Revive is offered, and Shuffle and Hint exist to postpone it. Building
 * the board without the holder would have meant building a game with no place
 * to put any of the revenue hooks.
 *
 * Direct-pair play stays in `game/board.ts` untouched, so the existing UI keeps
 * working while Codex migrates.
 *
 * Solvability survives the change: a deal built backwards from a valid removal
 * order is still winnable here, because a player can always take that order's
 * two tiles consecutively and clear them out of the holder immediately.
 */

import { freeTiles, isFree, type BoardState, type Tile } from '../game/board';
import { deal, canReshuffle, reshuffle } from '../game/deal';
import type { LayoutId } from '../game/layouts';
import { matchGroup } from '../game/tiles';

/** Parity value. Not a tuning knob — changing it changes the whole difficulty. */
export const HOLDER_CAPACITY = 4;

export type SessionStatus = 'playing' | 'won' | 'holder_full';

export interface PlaySession {
  readonly board: BoardState;
  /** Tile ids currently in the holder, oldest first. */
  readonly holder: readonly number[];
  readonly status: SessionStatus;
  /** Tiles cleared, for the score and for instrumentation. */
  readonly cleared: number;
  /** Counts, so the client never has to derive them for analytics. */
  readonly revivesUsed: number;
  readonly shufflesUsed: number;
  readonly hintsUsed: number;
}

export function startSession(layout: LayoutId, seed: number): PlaySession {
  return {
    board: deal(layout, seed),
    holder: [],
    status: 'playing',
    cleared: 0,
    revivesUsed: 0,
    shufflesUsed: 0,
    hintsUsed: 0,
  };
}

/** Rebuilds a session from a layout, a seed and the tap history. */
export function replaySession(
  layout: LayoutId,
  seed: number,
  taps: readonly number[],
): PlaySession | null {
  let session = startSession(layout, seed);
  for (const id of taps) {
    const next = tapTile(session, id);
    if (next === session) return null; // The history could not have happened.
    session = next;
  }
  return session;
}

export function holderTiles(session: PlaySession): Tile[] {
  return session.holder.map((id) => session.board.tiles.find((t) => t.id === id)!);
}

/** Free tiles on the board — what the player is allowed to tap. */
export function tappableTiles(session: PlaySession): Tile[] {
  if (session.status !== 'playing') return [];
  return freeTiles(session.board);
}

/**
 * Taps a tile into the holder.
 *
 * Returns the session unchanged when the tap was not legal, so an illegal tap
 * is a no-op rather than an error — the UI treats it as a miss, never a scold.
 */
export function tapTile(session: PlaySession, id: number): PlaySession {
  if (session.status !== 'playing') return session;
  if (!session.board.remaining.has(id)) return session;
  if (session.holder.includes(id)) return session;

  const live = session.board.tiles.filter((t) => session.board.remaining.has(t.id));
  const tile = live.find((t) => t.id === id);
  if (!tile || !isFree(tile, live)) return session;

  // Off the board and into the holder. The board no longer pins anything with
  // this tile, which is what makes the holder a real cost: you have spent a
  // slot to unpin whatever was underneath.
  const remaining = new Set(session.board.remaining);
  remaining.delete(id);
  const holder = [...session.holder, id];

  const partner = findMatch(session.board, holder, tile);
  if (partner !== null) {
    return settle({
      ...session,
      board: { ...session.board, remaining, removed: [...session.board.removed, [partner, id]] },
      holder: holder.filter((held) => held !== id && held !== partner),
      cleared: session.cleared + 2,
    });
  }

  return settle({ ...session, board: { ...session.board, remaining }, holder });
}

function findMatch(board: BoardState, holder: readonly number[], tile: Tile): number | null {
  const group = matchGroup(tile.face);
  for (const held of holder) {
    if (held === tile.id) continue;
    const other = board.tiles.find((t) => t.id === held)!;
    if (matchGroup(other.face) === group) return held;
  }
  return null;
}

function settle(session: PlaySession): PlaySession {
  if (session.board.remaining.size === 0 && session.holder.length === 0) {
    return { ...session, status: 'won' };
  }
  if (session.holder.length >= HOLDER_CAPACITY) {
    return { ...session, status: 'holder_full' };
  }
  return { ...session, status: 'playing' };
}

/**
 * Revive after a full holder: returns the held tiles to the board.
 *
 * They go back to the positions they came from, which is the only placement
 * that cannot make the board unsolvable. The app calls this only after a
 * verified ad grant or an explicit locally tracked free allowance.
 */
export function revive(session: PlaySession): PlaySession {
  if (session.status !== 'holder_full') return session;

  const remaining = new Set(session.board.remaining);
  for (const id of session.holder) remaining.add(id);

  return {
    ...session,
    board: { ...session.board, remaining },
    holder: [],
    status: 'playing',
    revivesUsed: session.revivesUsed + 1,
  };
}

/**
 * Shuffle the tiles still on the board. Usable while playing *or* while the
 * holder is full — in the second case the held tiles come back first, which is
 * what makes a paid shuffle worth buying at the moment of loss.
 */
export function shuffle(session: PlaySession, seed: number): PlaySession {
  const withHeldBack =
    session.status === 'holder_full'
      ? { ...revive(session), revivesUsed: session.revivesUsed }
      : session;

  if (!canReshuffle(withHeldBack.board)) return session;

  return {
    ...withHeldBack,
    board: reshuffle(withHeldBack.board, seed),
    status: 'playing',
    shufflesUsed: session.shufflesUsed + 1,
  };
}

/**
 * A pair the player could clear from here.
 *
 * With a holder in play, the best hint is not "two matching free tiles" — it is
 * a pair that is safe to pick up *given what is already in the holder*. A hint
 * that fills the last slot is worse than no hint.
 */
export function hintPair(session: PlaySession): [Tile, Tile] | null {
  if (session.status !== 'playing') return null;

  const free = tappableTiles(session);
  const held = holderTiles(session);
  const slotsLeft = HOLDER_CAPACITY - session.holder.length;

  // Cheapest first: a free tile that matches something already held costs one
  // slot and immediately frees it again.
  for (const tile of free) {
    const partner = held.find((h) => matchGroup(h.face) === matchGroup(tile.face));
    if (partner) return [partner, tile];
  }

  // Otherwise a matching pair of free tiles, which costs two slots transiently.
  if (slotsLeft >= 2) {
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        if (matchGroup(free[i].face) === matchGroup(free[j].face)) return [free[i], free[j]];
      }
    }
  }

  return null;
}

/** True when no safe move exists — the point at which a shuffle is the only out. */
export function isSoftLocked(session: PlaySession): boolean {
  return session.status === 'playing' && hintPair(session) === null;
}
