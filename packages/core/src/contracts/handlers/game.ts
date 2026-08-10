/**
 * Contracts 1 and 2 — board generation and move validation.
 *
 * SEED-ONLY, NOT SERVER-AUTHORITATIVE. The brief left this open; this is the
 * call and the reasoning, because it is load-bearing for two non-negotiables:
 *
 *   - "no login required for free play" — a server-authoritative board needs a
 *     session before the first tile appears.
 *   - "one tap to start" — it also needs a round trip, on a train, on a phone
 *     with two bars.
 *
 * A seed plus a layout reproduces the board exactly and deterministically on
 * any device, so the server and the client can both hold the same position
 * without either being the source of truth for *play*. Validation (contract 2)
 * replays the seed and gets the same board, which is what makes it verifiable
 * without server-side session state.
 *
 * The obvious objection is that the client can see the whole board. That is
 * true and it does not matter: this is a single-player game with no
 * leaderboard, no score, no currency and nothing to win. There is nobody to
 * cheat. Revisit only if a competitive mode ever appears.
 */

import {
  availableMoves,
  canPair,
  freeTiles,
  isComplete,
  isStuck,
  removePair,
  type BoardState,
} from '../../game/board';
import { deal } from '../../game/deal';
import { LAYOUTS, type LayoutId } from '../../game/layouts';
import { randomSeed } from '../../game/rng';
import { fail, ok, type ContractEnvelope } from '../envelope';
import { nowOf, type Ports } from '../ports';
import {
  CONTRACT_VERSION,
  type BoardGenerateRequest,
  type BoardGenerateResponse,
  type ValidateMoveRequest,
  type ValidateMoveResponse,
} from '../types';

const GENERATE = 'game/board/generate';
const VALIDATE = 'game/board/validate-move';

function isLayoutId(value: unknown): value is LayoutId {
  return typeof value === 'string' && value in LAYOUTS;
}

export function generateBoard(
  request: BoardGenerateRequest,
  ports: Ports = {},
): ContractEnvelope<BoardGenerateResponse> {
  const now = nowOf(ports);

  if (!isLayoutId(request.layout)) {
    return fail(GENERATE, CONTRACT_VERSION, {
      code: 'unknown_layout',
      message: `Unknown layout. Expected one of: ${Object.keys(LAYOUTS).join(', ')}.`,
      field: 'layout',
    }, { now });
  }

  if (request.seed !== undefined && !Number.isInteger(request.seed)) {
    return fail(GENERATE, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'Seed must be an integer.',
      field: 'seed',
    }, { now });
  }

  const seed = request.seed ?? (ports.randomSeed ?? randomSeed)();
  const board = deal(request.layout, seed);

  return ok<BoardGenerateResponse>(
    GENERATE,
    CONTRACT_VERSION,
    {
      layout: request.layout,
      seed,
      tileCount: board.tiles.length,
      layerCount: LAYOUTS[request.layout].maxZ + 1,
      solvable: true,
      openingMoves: availableMoves(board).length,
      tiles: request.includeTiles
        ? board.tiles.map((t) => ({ id: t.id, x: t.x, y: t.y, z: t.z, face: t.face }))
        : null,
    },
    { now },
  );
}

/** Replays `removed` onto a fresh deal. Null when the history is not consistent. */
function replay(layout: LayoutId, seed: number, removed: ValidateMoveRequest['removed']): BoardState | null {
  let board = deal(layout, seed);
  for (const pair of removed) {
    const next = removePair(board, pair[0], pair[1]);
    // `removePair` is a no-op on an illegal pair, so an unchanged board means
    // the client's history could not have happened.
    if (next === board) return null;
    board = next;
  }
  return board;
}

export function validateMove(
  request: ValidateMoveRequest,
  ports: Ports = {},
): ContractEnvelope<ValidateMoveResponse> {
  const now = nowOf(ports);

  if (!isLayoutId(request.layout)) {
    return fail(VALIDATE, CONTRACT_VERSION, {
      code: 'unknown_layout',
      message: 'Unknown layout.',
      field: 'layout',
    }, { now });
  }
  if (!Number.isInteger(request.seed)) {
    return fail(VALIDATE, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'Seed must be an integer.',
      field: 'seed',
    }, { now });
  }
  if (!Array.isArray(request.move) || request.move.length !== 2) {
    return fail(VALIDATE, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'A move is exactly two tile ids.',
      field: 'move',
    }, { now });
  }

  const board = replay(request.layout, request.seed, request.removed ?? []);
  if (!board) {
    return ok<ValidateMoveResponse>(
      VALIDATE,
      CONTRACT_VERSION,
      {
        valid: false,
        reason: 'replay_diverged',
        tilesRemaining: 0,
        movesRemaining: 0,
        boardComplete: false,
        boardStuck: false,
      },
      { now },
    );
  }

  const [a, b] = request.move;
  const after = canPair(board, a, b) ? removePair(board, a, b) : board;
  const valid = after !== board;

  return ok<ValidateMoveResponse>(
    VALIDATE,
    CONTRACT_VERSION,
    {
      valid,
      reason: valid ? 'ok' : rejectionReason(board, a, b),
      tilesRemaining: after.remaining.size,
      movesRemaining: availableMoves(after).length,
      boardComplete: isComplete(after),
      boardStuck: isStuck(after),
    },
    { now },
  );
}

/** Why a move was refused. Specific enough to debug, never used to scold a player. */
function rejectionReason(board: BoardState, a: number, b: number): ValidateMoveResponse['reason'] {
  if (a === b) return 'same_tile';
  if (!board.remaining.has(a) || !board.remaining.has(b)) return 'already_removed';

  const live = board.tiles.filter((t) => board.remaining.has(t.id));
  const tileA = live.find((t) => t.id === a);
  const tileB = live.find((t) => t.id === b);
  if (!tileA || !tileB) return 'already_removed';

  // Free means "can slide out", not "has a partner on the board" — deriving
  // this from availableMoves would call a partnerless free tile blocked.
  const free = new Set(freeTiles(board).map((t) => t.id));
  // Face mismatch is checked before blocking so the message names the real
  // problem when both are wrong.
  if (tileA.face.suit !== tileB.face.suit || tileA.face.rank !== tileB.face.rank) {
    const bothBonus =
      (tileA.face.suit === 'flower' && tileB.face.suit === 'flower') ||
      (tileA.face.suit === 'season' && tileB.face.suit === 'season');
    if (!bothBonus) return 'faces_do_not_match';
  }
  if (!free.has(a)) return 'first_tile_blocked';
  return 'second_tile_blocked';
}
