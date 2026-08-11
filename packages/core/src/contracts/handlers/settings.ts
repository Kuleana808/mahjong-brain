/**
 * Contract 4 — settings sync.
 *
 * Cross-device convenience, nothing more. The device is always the source of
 * truth for the session in front of the player; this only stops someone having
 * to find "large text" and "high contrast" again on their iPad.
 *
 * Conflicts resolve by revision, not by clock — two devices can disagree about
 * the time, but they cannot disagree about which revision they last saw. A
 * client that sends a stale `ifRevision` is told what the current values are
 * rather than having its write silently dropped or silently win.
 */

import { fail, notConfigured, ok, type ContractEnvelope } from '../envelope';
import { nowOf, type Ports } from '../ports';
import {
  CONTRACT_VERSION,
  type SettingsPatchRequest,
  type SettingsResponse,
  type SyncedSettings,
} from '../types';

const CONTRACT = 'api/settings';

export const DEFAULT_SYNCED_SETTINGS: SyncedSettings = {
  theme: 'system',
  fontScale: 1,
  reduceMotion: false,
  dimBlocked: true,
  haptics: true,
  sounds: true,
  difficultyPreference: 'auto',
};

const THEMES = new Set(['calm', 'calm-dark', 'high-contrast', 'system']);
const DIFFICULTIES = new Set(['auto', 'gentle', 'standard', 'demanding']);

/** Rejects anything outside the contract rather than coercing it. */
function validate(patch: SettingsPatchRequest): string | null {
  if (patch.theme !== undefined && !THEMES.has(patch.theme)) return 'theme';
  if (patch.difficultyPreference !== undefined && !DIFFICULTIES.has(patch.difficultyPreference)) {
    return 'difficultyPreference';
  }
  if (patch.fontScale !== undefined) {
    // The UI offers 1, 1.2 and 1.45. The range is wider so the bound does not
    // have to move every time the picker does.
    if (typeof patch.fontScale !== 'number' || patch.fontScale < 0.8 || patch.fontScale > 2) {
      return 'fontScale';
    }
  }
  for (const key of ['reduceMotion', 'dimBlocked', 'haptics', 'sounds'] as const) {
    if (patch[key] !== undefined && typeof patch[key] !== 'boolean') return key;
  }
  return null;
}

async function requireAccount(
  sessionToken: string | null,
  ports: Ports,
): Promise<{ accountId: string } | ContractEnvelope<never>> {
  const now = nowOf(ports);
  const missing: string[] = [];
  if (!ports.store) missing.push('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  if (!ports.session) missing.push('SESSION_SIGNING_KEY');
  if (missing.length > 0) return notConfigured(CONTRACT, CONTRACT_VERSION, missing, { now });

  const accountId = await ports.session!.verify(sessionToken);
  if (!accountId) {
    // Configured and working; the caller simply is not signed in.
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'unauthenticated',
      message: 'Sign in to sync your settings across devices.',
    }, { now, state: 'configured' });
  }
  return { accountId };
}

export async function getSettings(
  sessionToken: string | null,
  ports: Ports = {},
): Promise<ContractEnvelope<SettingsResponse>> {
  const now = nowOf(ports);
  const gate = await requireAccount(sessionToken, ports);
  if ('contract' in gate) return gate;

  const stored = await ports.store!.getSettings(gate.accountId);
  if (!stored) {
    // A signed-in account that has never synced is not an error; it is a new
    // account, and the defaults are the honest answer.
    return ok<SettingsResponse>(
      CONTRACT,
      CONTRACT_VERSION,
      { settings: DEFAULT_SYNCED_SETTINGS, updatedAt: now, revision: 0 },
      { now, state: 'configured' },
    );
  }

  return ok<SettingsResponse>(
    CONTRACT,
    CONTRACT_VERSION,
    { settings: stored.settings, updatedAt: stored.updatedAt, revision: stored.revision },
    { now, state: 'configured' },
  );
}

export async function patchSettings(
  sessionToken: string | null,
  patch: SettingsPatchRequest,
  ports: Ports = {},
): Promise<ContractEnvelope<SettingsResponse>> {
  const now = nowOf(ports);

  const badField = validate(patch ?? {});
  if (badField) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: `Not a valid value for ${badField}.`,
      field: badField,
    }, { now });
  }

  const gate = await requireAccount(sessionToken, ports);
  if ('contract' in gate) return gate;

  const stored = await ports.store!.getSettings(gate.accountId);
  const current = stored?.settings ?? DEFAULT_SYNCED_SETTINGS;
  const revision = stored?.revision ?? 0;

  if (patch.ifRevision !== undefined && patch.ifRevision !== revision) {
    // Somebody else wrote first. Hand back the current state so the client can
    // reconcile — do not guess which side the player meant.
    return ok<SettingsResponse>(
      CONTRACT,
      CONTRACT_VERSION,
      { settings: current, updatedAt: stored?.updatedAt ?? now, revision },
      {
        now,
        state: 'configured',
        fallbackReason: `Stale revision ${patch.ifRevision}; another device wrote revision ${revision}. Nothing was changed.`,
      },
    );
  }

  const { ifRevision: _ignored, ...changes } = patch ?? {};
  const written = await ports.store!.putSettings(
    gate.accountId,
    { ...current, ...changes },
    revision + 1,
  );

  return ok<SettingsResponse>(
    CONTRACT,
    CONTRACT_VERSION,
    { settings: written.settings, updatedAt: written.updatedAt, revision: written.revision },
    { now, state: 'configured' },
  );
}
