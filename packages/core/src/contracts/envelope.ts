/**
 * The 5-state response envelope.
 *
 * Every endpoint answers in this shape, always, including when it cannot do the
 * thing asked of it. The point is that a caller can tell the difference between
 * "this works", "this exists but nobody has configured it", and "this answered
 * you, but with something less than the real thing" — without guessing from a
 * status code.
 *
 * The four states are a readiness ladder, in order:
 *
 *   source_available  the code path exists and runs
 *   configured        its keys, env vars and webhooks are set in this environment
 *   live_verified     it has been observed working end to end against the real thing
 *   requires_review   it needs a human before it can proceed
 *
 * `fallback_reason` is orthogonal: it is set whenever the answer is degraded,
 * and says why in plain words. A response can be `live_verified` *and* carry a
 * fallback reason — the hint coach does exactly that when Ollama is down and the
 * offline explainer answers instead.
 *
 * A degraded answer is never silent. If `fallback_reason` is null, the caller
 * got the real thing.
 */

export type ContractState =
  | 'source_available'
  | 'configured'
  | 'live_verified'
  | 'requires_review';

export interface ContractError {
  /** Stable machine-readable code. Never a sentence. */
  readonly code: string;
  /** Plain-language, safe to show a player. Never leaks internals. */
  readonly message: string;
  /** Which field was wrong, when that is knowable. */
  readonly field?: string;
}

export interface ContractEnvelope<T> {
  /** Contract id, matching docs/api-contracts.md. */
  readonly contract: string;
  readonly version: string;
  readonly state: ContractState;
  /** Set when the answer is degraded. Null when it is the real thing. */
  readonly fallback_reason: string | null;
  readonly data: T | null;
  readonly error: ContractError | null;
  /** ISO 8601. Injected, never read from a clock inside a pure handler. */
  readonly generated_at: string;
}

export interface EnvelopeOptions {
  readonly state?: ContractState;
  readonly fallbackReason?: string | null;
  readonly now?: string;
}

const iso = (now?: string) => now ?? new Date().toISOString();

export function ok<T>(
  contract: string,
  version: string,
  data: T,
  options: EnvelopeOptions = {},
): ContractEnvelope<T> {
  return {
    contract,
    version,
    state: options.state ?? 'live_verified',
    fallback_reason: options.fallbackReason ?? null,
    data,
    error: null,
    generated_at: iso(options.now),
  };
}

export function fail<T = never>(
  contract: string,
  version: string,
  error: ContractError,
  options: EnvelopeOptions = {},
): ContractEnvelope<T> {
  return {
    contract,
    version,
    state: options.state ?? 'source_available',
    fallback_reason: options.fallbackReason ?? null,
    data: null,
    error,
    generated_at: iso(options.now),
  };
}

/**
 * The answer for an endpoint whose code is written but whose credentials are
 * not set in this environment.
 *
 * Deliberately not an error: the contract is real, Codex can build against the
 * shape today, and the state says exactly what is missing. What it must never
 * do is invent a plausible success.
 */
export function notConfigured<T = never>(
  contract: string,
  version: string,
  missing: readonly string[],
  options: EnvelopeOptions = {},
): ContractEnvelope<T> {
  return {
    contract,
    version,
    state: 'source_available',
    fallback_reason: `Not configured in this environment. Missing: ${missing.join(', ')}.`,
    data: null,
    error: {
      code: 'not_configured',
      message: 'This feature is not available yet.',
    },
    generated_at: iso(options.now),
  };
}

/** HTTP status for an envelope. Transport concern, kept next to the shape. */
export function httpStatus(envelope: ContractEnvelope<unknown>): number {
  if (!envelope.error) return 200;
  switch (envelope.error.code) {
    case 'invalid_request':
    case 'unknown_layout':
      return 400;
    case 'unauthenticated':
      return 401;
    case 'not_found':
      return 404;
    case 'not_configured':
      return 503;
    default:
      return 500;
  }
}
