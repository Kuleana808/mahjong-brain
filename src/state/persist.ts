/**
 * Local persistence.
 *
 * Everything the game knows lives on the device. There is no account, no login
 * for free play, and nothing to sync before you can start — one tap and the
 * board is there.
 *
 * Optional account sync for settings and verified unlocks lives in
 * `src/auth/apple.ts`. It is opt-in and never a precondition for play.
 */

import { Preferences } from '@capacitor/preferences';

const KEY = 'mahjongbrain.state.v1';
let writeQueue: Promise<void> = Promise.resolve();

export interface PersistedState {
  readonly version: 1;
  readonly settings: unknown;
  readonly progress: unknown;
  /** Board in progress, so closing the app mid-game loses nothing. */
  readonly resume: unknown;
}

export interface PersistedLoadResult {
  readonly state: PersistedState | null;
  readonly recoveredFromCorruption: boolean;
}

export async function loadPersisted(): Promise<PersistedLoadResult> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return { state: null, recoveredFromCorruption: false };
    const parsed = JSON.parse(value) as PersistedState;
    return parsed.version === 1
      ? { state: parsed, recoveredFromCorruption: false }
      : { state: null, recoveredFromCorruption: true };
  } catch {
    // A corrupt blob must never stop the game starting.
    return { state: null, recoveredFromCorruption: true };
  }
}

export async function savePersisted(state: PersistedState): Promise<void> {
  const value = JSON.stringify(state);
  writeQueue = writeQueue.then(async () => {
    try {
      await Preferences.set({ key: KEY, value });
    } catch {
      // Storage full or unavailable — the current session still plays fine.
    }
  });
  await writeQueue;
}

/** Wait until the newest queued snapshot is durable before iOS backgrounds us. */
export function flushPersisted(): Promise<void> {
  return writeQueue;
}
