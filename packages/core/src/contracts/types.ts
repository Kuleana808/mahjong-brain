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

// ---------------------------------------------------------------------------
// Parity additions (D-014). Contracts 11-13.
//
// The launch monetisation and retention loops mirror the incumbent's, so these
// exist to serve them: instrumentation for every funnel step, a daily reward
// loop, and server-side verification of rewarded ads.
// ---------------------------------------------------------------------------

// --- the product catalogue -------------------------------------------------

/**
 * Everything a player can obtain, and how.
 *
 * `remove_ads` is the old "$4.99 lifetime, no ads" positioning, demoted from
 * launch pitch to one product among several. It ships as a **post-parity A/B
 * test**, not as the thing the app is about (D-014).
 */
export type GrantKind = 'revive' | 'hint' | 'shuffle' | 'remove_ads';

export type GrantSource = 'rewarded_ad' | 'iap' | 'daily_reward' | 'free_allowance';

export interface ProductDefinition {
  readonly kind: GrantKind;
  readonly source: GrantSource;
  /** StoreKit product id, for the ones that are purchases. */
  readonly productId: string | null;
  readonly consumable: boolean;
}

export const PRODUCT_CATALOGUE: readonly ProductDefinition[] = [
  { kind: 'revive', source: 'rewarded_ad', productId: null, consumable: true },
  { kind: 'hint', source: 'rewarded_ad', productId: null, consumable: true },
  { kind: 'shuffle', source: 'iap', productId: 'com.nihi.mahjong.shuffle5', consumable: true },
  { kind: 'remove_ads', source: 'iap', productId: 'com.nihi.mahjong.lifetime', consumable: false },
];

// --- 11. POST /api/events/batch --------------------------------------------

export interface EventsBatchResponse {
  readonly accepted: number;
  /** Per-event rejections, so a client bug is visible rather than silent. */
  readonly rejected: readonly { readonly index: number; readonly reason: string }[];
  readonly schemaVersion: number;
}

// --- 12. GET /api/retention/daily, POST /api/retention/daily/claim ---------

export interface DailyRewardState {
  /** 1-7, cycling. Day 7 is the big one, then it starts over. */
  readonly day: number;
  readonly streakDays: number;
  readonly claimableToday: boolean;
  /** What claiming today gives. */
  readonly reward: { readonly kind: GrantKind; readonly quantity: number };
  /** ISO date (not timestamp) of the last claim, in the player's day boundary. */
  readonly lastClaimedOn: string | null;
  /** True when a day was missed and the streak restarts at 1. */
  readonly streakBroken: boolean;
}

export interface DailyClaimRequest {
  /**
   * The player's local date, `YYYY-MM-DD`. Sent by the client because a daily
   * reward is a local-midnight concept, and a server in UTC would roll the day
   * over mid-evening in Hawai'i.
   */
  readonly localDate: string;
}

export interface DailyClaimResponse extends DailyRewardState {
  readonly granted: { readonly kind: GrantKind; readonly quantity: number } | null;
}

// --- 13. POST /api/ads/reward-callback -------------------------------------

/**
 * Server-side verification of a rewarded ad.
 *
 * The ad network calls this, signed. The *client* never gets to assert that an
 * ad was watched — same rule as purchases: no API grants anything from a click.
 */
export interface AdRewardCallbackRequest {
  readonly placement: 'revive' | 'hint';
  /** Opaque per-impression id from the network, used to prevent replay. */
  readonly transactionId: string;
  /** The signed payload exactly as the network sent it, for verification. */
  readonly signature: string;
  readonly rawQuery: string;
  readonly anonymousDeviceId: string;
}

export interface AdRewardCallbackResponse {
  readonly granted: boolean;
  readonly kind: GrantKind | null;
  /** True when this impression id was already redeemed. */
  readonly duplicate: boolean;
}
