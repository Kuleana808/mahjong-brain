/**
 * Which brain answered, and why.
 *
 * Doctrine is local-first, not local-only: prefer the offline explainer, reach
 * for Ollama when it is actually there and actually fast, and never let either
 * choice cost the player a visible wait. The one hard rule is that every
 * routing decision is recorded — no silent fallbacks.
 */

export type Tier = 'offline' | 'ollama' | 'remote';

export interface RouteRecord {
  readonly tier: Tier;
  readonly latencyMs: number;
  /** Set when a preferred tier was skipped or failed. */
  readonly fallbackFrom?: Tier;
  readonly reason?: string;
}

const LOG_LIMIT = 50;
const log: RouteRecord[] = [];

export function recordRoute(record: RouteRecord): void {
  log.push(record);
  if (log.length > LOG_LIMIT) log.shift();
  if (import.meta.env.DEV) {
    const suffix = record.fallbackFrom ? ` (fell back from ${record.fallbackFrom}: ${record.reason})` : '';
    console.info(`[hint] ${record.tier} in ${Math.round(record.latencyMs)}ms${suffix}`);
  }
}

/** Read-only view for the debug panel. Never shipped to a server. */
export function routeLog(): readonly RouteRecord[] {
  return log;
}
