/**
 * Request and response shapes for the ten contracts.
 *
 * This file is the interface between Claude Code and Codex. Changing a shape
 * here is a PR both sides review — see docs/api-contracts.md, which documents
 * these same shapes in prose and stays in sync with this file.
 */

import type { LayoutId } from '../game/layouts';
import type { TileFace } from '../game/tiles';

export const CONTRACT_VERSION = '1';

// --- 1. game/board/generate ------------------------------------------------

export interface BoardGenerateRequest {
  readonly layout: LayoutId;
  /**
   * Reuse a previous board exactly. Omit for a new one. Seeds are the whole
   * board: same seed plus same layout always deals the same tiles, on any
   * device, offline.
   */
  readonly seed?: number;
  /**
   * Include the dealt tiles in the response. The client can derive them from
   * the seed alone, so this is for debugging and for cross-checking that both
   * sides agree.
   */
  readonly includeTiles?: boolean;
}

export interface BoardTile {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly face: TileFace;
}

export interface BoardGenerateResponse {
  readonly layout: LayoutId;
  readonly seed: number;
  readonly tileCount: number;
  readonly layerCount: number;
  /** Guaranteed by construction — the deal is built from a valid removal order. */
  readonly solvable: true;
  readonly openingMoves: number;
  readonly tiles: readonly BoardTile[] | null;
}

// --- 2. game/board/validate-move -------------------------------------------

export interface ValidateMoveRequest {
  readonly layout: LayoutId;
  readonly seed: number;
  /** Pairs already taken, in order. Replayed to rebuild the position. */
  readonly removed: readonly (readonly [number, number])[];
  /** The pair being attempted. */
  readonly move: readonly [number, number];
}

export interface ValidateMoveResponse {
  readonly valid: boolean;
  /** Present when invalid. One of the reasons below. */
  readonly reason:
    | 'ok'
    | 'same_tile'
    | 'already_removed'
    | 'faces_do_not_match'
    | 'first_tile_blocked'
    | 'second_tile_blocked'
    | 'replay_diverged';
  readonly tilesRemaining: number;
  readonly movesRemaining: number;
  readonly boardComplete: boolean;
  readonly boardStuck: boolean;
}

// --- 3. POST /api/auth/apple-id --------------------------------------------

export interface AppleAuthRequest {
  /** The `identityToken` from Sign in with Apple, as a JWS compact string. */
  readonly identityToken: string;
  /** Apple's opaque stable user id, for cross-checking the token subject. */
  readonly userIdentifier?: string;
}

export interface AppleAuthResponse {
  readonly sessionToken: string;
  readonly expiresAt: string;
  readonly accountId: string;
  /** True the first time this Apple ID is seen. */
  readonly created: boolean;
}

// --- 4. GET /api/settings, PATCH /api/settings ------------------------------

export type ThemePreference = 'calm' | 'calm-dark' | 'high-contrast' | 'system';

export interface SyncedSettings {
  readonly theme: ThemePreference;
  readonly fontScale: number;
  readonly reduceMotion: boolean;
  readonly dimBlocked: boolean;
  readonly haptics: boolean;
  /**
   * Player override for the silent difficulty model. 'auto' is the default and
   * the only value the game itself ever sets.
   */
  readonly difficultyPreference: 'auto' | 'gentle' | 'standard' | 'demanding';
}

export interface SettingsResponse {
  readonly settings: SyncedSettings;
  readonly updatedAt: string;
  /** Server wins on conflict only if its copy is newer. */
  readonly revision: number;
}

export type SettingsPatchRequest = Partial<SyncedSettings> & {
  /** Revision the client last saw. Omit to force-overwrite. */
  readonly ifRevision?: number;
};

// --- 5. POST /api/hints/generate -------------------------------------------

export interface HintGenerateRequest {
  readonly layout: LayoutId;
  readonly seed: number;
  readonly removed: readonly (readonly [number, number])[];
  /**
   * Richer phrasing is part of the paid unlock. The recommendation itself is
   * identical either way — free players do not get a worse hint, they get a
   * plainer sentence.
   */
  readonly allowModelPhrasing?: boolean;
}

export interface HintGenerateResponse {
  /** The two tile ids to highlight. */
  readonly pair: readonly [number, number];
  /** Two or three sentences that teach the pattern. */
  readonly text: string;
  /** One line, for the screen-reader announcement. */
  readonly summary: string;
  /** Which brain answered. */
  readonly tier: 'offline' | 'ollama' | 'remote';
  readonly latencyMs: number;
}

// --- 6. POST /api/play-pattern/log -----------------------------------------

export interface PlayPatternLogRequest {
  readonly layout: LayoutId;
  readonly completed: boolean;
  readonly movesPlayed: number;
  readonly hintsUsed: number;
  readonly elapsedSeconds: number;
  /** The profile the client currently holds. Omit on a first-ever board. */
  readonly profile?: SkillProfileWire;
}

/** The skill profile as it crosses the wire. Mirrors `SkillProfile` in game/. */
export interface SkillProfileWire {
  readonly secondsPerMove: number | null;
  readonly hintRate: number;
  readonly completionRate: number;
  readonly boardsPlayed: number;
  readonly boardsCompleted: number;
  readonly lastLayoutId: LayoutId | null;
}

export interface PlayPatternLogResponse {
  readonly profile: SkillProfileWire;
  /** 0-1. Never shown to the player — difficulty adaptation is silent. */
  readonly skillScore: number;
  readonly accepted: boolean;
  /** Set when the board was too short to say anything about skill. */
  readonly ignoredReason: string | null;
}

// --- 7. GET /api/difficulty/next-board -------------------------------------

export interface NextBoardRequest {
  readonly profile?: SkillProfileWire;
}

export interface NextBoardResponse {
  readonly layout: LayoutId;
  readonly seed: number;
  readonly tileCount: number;
  /**
   * Why this layout. For the debug panel and for us — never rendered in the
   * game, because the player must not be told their difficulty changed.
   */
  readonly rationale: string;
  readonly skillScore: number;
}

// --- 8. POST /api/receipts/validate ----------------------------------------

export interface ReceiptValidateRequest {
  /**
   * StoreKit 2 signed transaction (JWS compact). Not a receipt string, not a
   * client boolean — the only thing that can establish a purchase.
   */
  readonly signedTransaction: string;
  readonly accountId?: string;
}

export interface ReceiptValidateResponse {
  readonly unlocked: boolean;
  readonly productId: string;
  readonly originalTransactionId: string;
  readonly purchasedAt: string;
  /** 'sandbox' | 'production', straight from the verified payload. */
  readonly environment: string;
  readonly revoked: boolean;
}

// --- 9. GET /api/unlock-status ---------------------------------------------

export interface UnlockStatusResponse {
  readonly unlocked: boolean;
  /** How we know. Never 'client_claim' — a client cannot assert a purchase. */
  readonly source: 'verified_transaction' | 'app_store_notification' | 'none';
  readonly productId: string | null;
  readonly verifiedAt: string | null;
}

// --- 10. POST /api/analytics/session ---------------------------------------

export interface SessionAnalyticsRequest {
  /** Explicit opt-in. Absent or false means the body is discarded unread. */
  readonly consent: boolean;
  readonly boardsStarted: number;
  readonly boardsCompleted: number;
  readonly hintsUsed: number;
  readonly totalSeconds: number;
  readonly appVersion: string;
  /**
   * Rotating, device-local, resettable. Never an IDFA, never an Apple id,
   * never anything that identifies a person across installs.
   */
  readonly anonymousSessionId: string;
}

export interface SessionAnalyticsResponse {
  readonly stored: boolean;
  readonly reason: string | null;
}
