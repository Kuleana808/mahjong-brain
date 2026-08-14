/**
 * The event catalogue.
 *
 * Instrumentation ships before feature #1 and nothing launches without it, so
 * this file is the contract for what "instrumented" means. If an event is not
 * in here, the client cannot send it and the server will not store it.
 *
 * A closed catalogue rather than free-form events, for three reasons: a typo in
 * an event name is a silently missing funnel step; an open schema is how a
 * device identifier eventually ends up in an analytics table by accident; and
 * cohort queries are only writable against names that are known in advance.
 *
 * Adding an event is a contract PR. That is the intended friction — every
 * feature ships with a hypothesis and a metric, and the metric is one of these.
 */

import type { LayoutId } from '../game/layouts';

export const EVENT_SCHEMA_VERSION = 1;

/**
 * Every name the system knows.
 *
 * Grouped by the question each group answers. The groups map to the funnels the
 * weekly cohort review actually looks at, not to code structure.
 */
export const EVENT_NAMES = [
  // Does the app open, and does anyone come back?
  'app_open',
  'app_background',
  'session_start',
  'session_end',

  // Does onboarding land? Every screen, so a drop-off has a location.
  'tos_shown',
  'age_gate_shown',
  'age_gate_passed',
  'age_gate_failed',
  'tos_accepted',
  'loading_quote_shown',
  'tutorial_step_shown',
  'tutorial_step_completed',
  'tutorial_first_pair_cleared',
  'tutorial_completed',
  'tutorial_skipped',

  // Does the core loop work?
  'board_start',
  'tile_tap',
  'tile_tap_rejected',
  'pair_cleared',
  'holder_slot_filled',
  'holder_full',
  'board_won',
  'board_abandoned',

  // Do the revenue hooks get seen, tapped, and completed?
  'revive_offered',
  'revive_tapped',
  'revive_ad_started',
  'revive_ad_completed',
  'revive_ad_abandoned',
  'revive_granted',
  'hint_tapped',
  'hint_ad_started',
  'hint_ad_completed',
  'hint_ad_abandoned',
  'hint_shown',
  'interstitial_ad_started',
  'interstitial_ad_completed',
  'interstitial_ad_skipped',
  'shuffle_tapped',
  'shuffle_iap_shown',
  'shuffle_iap_purchased',
  'shuffle_iap_cancelled',
  'shuffle_granted',
  'store_shown',
  'iap_purchase_started',
  'iap_purchase_completed',
  'iap_purchase_failed',
  'iap_restore_tapped',

  // Do the retention loops fire?
  'daily_reward_shown',
  'daily_reward_claimed',
  'streak_advanced',
  'streak_broken',
  'notification_permission_shown',
  'notification_permission_granted',
  'notification_permission_denied',

  // Settings, so an accessibility change is visible in the data.
  'settings_opened',
  'setting_changed',

  // Progression surfaces. Level is a ratchet, IQ is an estimate — see
  // progression/progression.ts for why they are separate numbers.
  'level_up',
  'iq_changed',
  'home_shown',
  'game_over_shown',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

const NAMES = new Set<string>(EVENT_NAMES);

/**
 * Properties an event may carry.
 *
 * Deliberately small and deliberately all non-identifying. There is no free
 * `metadata` bag: the moment one exists, something identifying ends up in it.
 */
export interface EventProperties {
  readonly layout?: LayoutId;
  /** Board seed, so a funnel drop can be reproduced exactly. */
  readonly seed?: number;
  /** 0-based index for tutorial steps. */
  readonly step?: number;
  /** Holder occupancy at the moment of the event, 0-4. */
  readonly holderCount?: number;
  readonly tilesRemaining?: number;
  readonly cleared?: number;
  readonly elapsedMs?: number;
  readonly productId?: string;
  /** Which placement an ad was requested for. */
  readonly placement?: 'revive' | 'hint' | 'between_rounds';
  /** Why something was refused or abandoned. Enumerated, never free text. */
  readonly reason?: string;
  /** Setting key for `setting_changed`. Never the value. */
  readonly settingKey?: string;
  readonly streakDays?: number;
  readonly level?: number;
  readonly iq?: number;
  readonly screen?: string;
}

export interface ClientEvent {
  readonly name: EventName;
  /** Client clock, ISO 8601. The server also stamps its own arrival time. */
  readonly at: string;
  /**
   * Monotonic per-session counter. Makes ordering recoverable when a batch is
   * queued offline and arrives out of order, which it will.
   */
  readonly sequence: number;
  readonly properties?: EventProperties;
}

export interface EventBatch {
  readonly schemaVersion: number;
  /**
   * Rotating, device-local, resettable. Not an IDFA, not an Apple id, not
   * anything that survives a reinstall or identifies a person.
   */
  readonly anonymousDeviceId: string;
  /** New on every cold start. Lets sessions be counted without a device join. */
  readonly sessionId: string;
  readonly appVersion: string;
  readonly platform: 'ios' | 'android' | 'web';
  readonly events: readonly ClientEvent[];
}

/** Hard cap per request. A client with a large offline queue sends several. */
export const MAX_EVENTS_PER_BATCH = 500;

export interface EventValidation {
  readonly accepted: ClientEvent[];
  /** Rejected events, with the reason, so a client bug is visible not silent. */
  readonly rejected: { readonly index: number; readonly reason: string }[];
}

/**
 * Validates a batch, event by event.
 *
 * One bad event does not discard the batch — a dropped funnel is worse than a
 * partial one, and a client shipping one malformed event should not lose the
 * other 499. Rejections come back in the response so they are visible.
 */
export function validateBatch(batch: EventBatch): EventValidation {
  const accepted: ClientEvent[] = [];
  const rejected: { index: number; reason: string }[] = [];

  batch.events.forEach((event, index) => {
    if (!event || typeof event !== 'object') {
      rejected.push({ index, reason: 'not an object' });
      return;
    }
    if (!NAMES.has(event.name)) {
      rejected.push({ index, reason: `unknown event name "${String(event.name)}"` });
      return;
    }
    if (typeof event.at !== 'string' || Number.isNaN(Date.parse(event.at))) {
      rejected.push({ index, reason: 'at is not an ISO timestamp' });
      return;
    }
    if (!Number.isInteger(event.sequence) || event.sequence < 0) {
      rejected.push({ index, reason: 'sequence is not a non-negative integer' });
      return;
    }
    accepted.push(event);
  });

  return { accepted, rejected };
}

/** Properties that may be stored. Anything else is dropped before the insert. */
const ALLOWED_PROPERTIES = [
  'layout',
  'seed',
  'step',
  'holderCount',
  'tilesRemaining',
  'cleared',
  'elapsedMs',
  'productId',
  'placement',
  'reason',
  'settingKey',
  'streakDays',
  'level',
  'iq',
  'screen',
] as const;

/**
 * Allow-list, not deny-list.
 *
 * A property added to `EventProperties` later cannot start flowing to storage
 * without someone adding it here on purpose, and a client that invents its own
 * property gets it dropped rather than persisted.
 */
export function sanitiseProperties(properties: unknown): Record<string, unknown> {
  if (!properties || typeof properties !== 'object') return {};
  const source = properties as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_PROPERTIES) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}
