/**
 * Local persistence.
 *
 * Everything the game knows lives on the device. There is no account, no login
 * for free play, and nothing to sync before you can start — one tap and the
 * board is there.
 *
 * TODO(PR 4): optional Supabase sync for settings and the unlock, so a player
 * who buys on the phone gets it on the iPad. Opt-in, and never a precondition
 * for playing.
 */

import { Preferences } from '@capacitor/preferences';

const KEY = 'mahjongbrain.state.v1';

export interface PersistedState {
  readonly version: 1;
  readonly settings: unknown;
  readonly progress: unknown;
  /** Board in progress, so closing the app mid-game loses nothing. */
  readonly resume: unknown;
}

export async function loadPersisted(): Promise<PersistedState | null> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return null;
    const parsed = JSON.parse(value) as PersistedState;
    return parsed.version === 1 ? parsed : null;
  } catch {
    // A corrupt blob must never stop the game starting.
    return null;
  }
}

export async function savePersisted(state: PersistedState): Promise<void> {
  try {
    await Preferences.set({ key: KEY, value: JSON.stringify(state) });
  } catch {
    // Storage full or unavailable — the current session still plays fine.
  }
}
