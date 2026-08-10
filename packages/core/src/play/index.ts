/**
 * Holder-based play — the parity mechanic. See `session.ts` for why this
 * exists and how it differs from the direct-pair mode in `game/board.ts`.
 */

export {
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
  type SessionStatus,
} from './session';
