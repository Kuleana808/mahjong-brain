/**
 * Contracts 6 and 7 — play-pattern logging and the next board's difficulty.
 *
 * The model is the same one the client runs locally, deliberately: the server
 * is a *sync point*, not a second brain. A player offline for a week gets the
 * same adaptation they would have got online, and when they reconnect nothing
 * jumps.
 *
 * SILENCE IS A CONTRACT TERM. `rationale` exists for our debug panel. It must
 * never be rendered in the game, and no response here ever tells a player that
 * their difficulty moved. If a UI surfaces it, that is a contract violation,
 * not a design choice.
 */

import { deal } from '../../game/deal';
import {
  chooseLayout,
  INITIAL_PROFILE,
  recordOutcome,
  skillScore,
  type SkillProfile,
} from '../../game/difficulty';
import { LAYOUTS, type LayoutId } from '../../game/layouts';
import { randomSeed } from '../../game/rng';
import { fail, ok, type ContractEnvelope } from '../envelope';
import { nowOf, type Ports } from '../ports';
import {
  CONTRACT_VERSION,
  type NextBoardRequest,
  type NextBoardResponse,
  type PlayPatternLogRequest,
  type PlayPatternLogResponse,
  type SkillProfileWire,
} from '../types';

const LOG = 'api/play-pattern/log';
const NEXT = 'api/difficulty/next-board';

/** Boards shorter than this say nothing about skill. Mirrors the local model. */
const MEANINGFUL_MOVES = 5;

function toProfile(wire: SkillProfileWire | undefined): SkillProfile {
  if (!wire) return INITIAL_PROFILE;
  return {
    secondsPerMove: wire.secondsPerMove ?? null,
    hintRate: wire.hintRate ?? 0,
    completionRate: wire.completionRate ?? 0.5,
    boardsPlayed: wire.boardsPlayed ?? 0,
    boardsCompleted: wire.boardsCompleted ?? 0,
    lastLayoutId: wire.lastLayoutId ?? null,
  };
}

const toWire = (profile: SkillProfile): SkillProfileWire => ({
  secondsPerMove: profile.secondsPerMove,
  hintRate: profile.hintRate,
  completionRate: profile.completionRate,
  boardsPlayed: profile.boardsPlayed,
  boardsCompleted: profile.boardsCompleted,
  lastLayoutId: profile.lastLayoutId,
});

export function logPlayPattern(
  request: PlayPatternLogRequest,
  ports: Ports = {},
): ContractEnvelope<PlayPatternLogResponse> {
  const now = nowOf(ports);

  if (!(request.layout in LAYOUTS)) {
    return fail(LOG, CONTRACT_VERSION, {
      code: 'unknown_layout',
      message: 'Unknown layout.',
      field: 'layout',
    }, { now });
  }
  if (!Number.isFinite(request.movesPlayed) || request.movesPlayed < 0) {
    return fail(LOG, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'movesPlayed must be a non-negative number.',
      field: 'movesPlayed',
    }, { now });
  }

  const before = toProfile(request.profile);
  const after = recordOutcome(before, {
    layoutId: request.layout,
    completed: Boolean(request.completed),
    movesPlayed: request.movesPlayed,
    hintsUsed: Math.max(0, request.hintsUsed ?? 0),
    elapsedSeconds: Math.max(0, request.elapsedSeconds ?? 0),
  });

  const ignored =
    request.movesPlayed < MEANINGFUL_MOVES
      ? 'Board ended before it could say anything about skill; counted as played but excluded from the averages.'
      : null;

  return ok<PlayPatternLogResponse>(
    LOG,
    CONTRACT_VERSION,
    {
      profile: toWire(after),
      skillScore: skillScore(after),
      accepted: true,
      ignoredReason: ignored,
    },
    { now },
  );
}

export function nextBoard(
  request: NextBoardRequest,
  ports: Ports = {},
): ContractEnvelope<NextBoardResponse> {
  const now = nowOf(ports);
  const profile = toProfile(request.profile);
  const layout: LayoutId = chooseLayout(profile);
  const score = skillScore(profile);
  const seed = (ports.randomSeed ?? randomSeed)();

  return ok<NextBoardResponse>(
    NEXT,
    CONTRACT_VERSION,
    {
      layout,
      seed,
      tileCount: deal(layout, seed).tiles.length,
      // Debug only. Never rendered — see the note at the top of this file.
      rationale:
        profile.secondsPerMove === null
          ? 'No history yet, so the gentlest layout.'
          : `skill ${score.toFixed(2)} from ${profile.secondsPerMove.toFixed(1)}s per move and a ${(profile.hintRate * 100).toFixed(0)}% hint rate over ${profile.boardsPlayed} boards.`,
      skillScore: score,
    },
    { now },
  );
}
