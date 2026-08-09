/**
 * The ten contracts.
 *
 * Documented in prose in `docs/api-contracts.md`; the shapes live in
 * `./types.ts`. Handlers are pure functions of (request, ports) so they run
 * identically in the dev server, in a Supabase Edge Function, and in a test.
 */

export * from './envelope';
export * from './ports';
export * from './types';

export { generateBoard, validateMove } from './handlers/game';
export { authenticateWithApple } from './handlers/auth';
export { DEFAULT_SYNCED_SETTINGS, getSettings, patchSettings } from './handlers/settings';
export { generateHint } from './handlers/hints';
export { logPlayPattern, nextBoard } from './handlers/difficulty';
export { unlockStatus, validateReceipt } from './handlers/purchases';
export { recordSessionAnalytics } from './handlers/analytics';

/** Readiness at a glance. Kept honest by `contracts.test.ts`. */
export const CONTRACT_REGISTRY = [
  { id: 'game/board/generate', method: 'GET', path: '/api/game/board/generate', needs: [] },
  { id: 'game/board/validate-move', method: 'POST', path: '/api/game/board/validate-move', needs: [] },
  { id: 'api/auth/apple-id', method: 'POST', path: '/api/auth/apple-id', needs: ['apple', 'store', 'session'] },
  { id: 'api/settings', method: 'GET|PATCH', path: '/api/settings', needs: ['store', 'session'] },
  { id: 'api/hints/generate', method: 'POST', path: '/api/hints/generate', needs: [] },
  { id: 'api/play-pattern/log', method: 'POST', path: '/api/play-pattern/log', needs: [] },
  { id: 'api/difficulty/next-board', method: 'GET', path: '/api/difficulty/next-board', needs: [] },
  { id: 'api/receipts/validate', method: 'POST', path: '/api/receipts/validate', needs: ['storekit', 'store'] },
  { id: 'api/unlock-status', method: 'GET', path: '/api/unlock-status', needs: ['store', 'session'] },
  { id: 'api/analytics/session', method: 'POST', path: '/api/analytics/session', needs: ['store'] },
] as const;
