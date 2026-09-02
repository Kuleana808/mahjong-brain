import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

import type {
  AppleAuthResponse,
  SettingsResponse,
  SyncedSettings,
  UnlockStatusResponse,
} from '../../packages/core/src/contracts/types';
import { ApiContractError, apiConfigured, apiRequest } from '../services/api';

const SESSION_KEY = 'mahjongbrain.account.session.v1';

interface AppleSignInNative {
  signIn(): Promise<{ identityToken: string; userIdentifier: string }>;
}

const appleGlobal = globalThis as typeof globalThis & { __mahjongAppleSignIn?: AppleSignInNative };
const AppleSignIn = appleGlobal.__mahjongAppleSignIn ??= registerPlugin<AppleSignInNative>('AppleSignIn');

export interface AccountSession {
  readonly token: string;
  readonly expiresAt: string;
  readonly accountId: string;
}

export interface AccountSnapshot {
  readonly session: AccountSession;
  readonly created: boolean;
  readonly settings: SettingsResponse | null;
  readonly unlock: UnlockStatusResponse | null;
}

export function appleSignInAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios' && apiConfigured();
}

export async function loadAccountSession(): Promise<AccountSession | null> {
  try {
    const { value } = await Preferences.get({ key: SESSION_KEY });
    if (!value) return null;
    const session = JSON.parse(value) as AccountSession;
    if (!session.token || !session.accountId || Date.parse(session.expiresAt) <= Date.now()) {
      await Preferences.remove({ key: SESSION_KEY });
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

async function saveSession(response: AppleAuthResponse): Promise<AccountSession> {
  const session = {
    token: response.sessionToken,
    expiresAt: response.expiresAt,
    accountId: response.accountId,
  };
  await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
  return session;
}

async function snapshot(session: AccountSession, created = false): Promise<AccountSnapshot> {
  const optionalRequest = async <T>(path: string): Promise<T | null> => {
    try {
      return (await apiRequest<T>(path, { bearer: session.token })).data;
    } catch (cause) {
      if (
        cause instanceof ApiContractError &&
        ['invalid_session', 'unauthenticated'].includes(cause.code)
      ) {
        throw cause;
      }
      // Offline settings/unlock sync must not block local play.
      return null;
    }
  };
  const [settings, unlock] = await Promise.all([
    optionalRequest<SettingsResponse>('/api/settings'),
    optionalRequest<UnlockStatusResponse>('/api/unlock-status'),
  ]);
  return { session, created, settings, unlock };
}

export async function signInWithApple(): Promise<AccountSnapshot> {
  if (!appleSignInAvailable()) throw new Error('Sign in with Apple is not configured in this build.');
  const credential = await AppleSignIn.signIn();
  const envelope = await apiRequest<AppleAuthResponse>('/api/auth/apple-id', {
    method: 'POST',
    body: credential,
  });
  if (!envelope.data) throw new Error('Apple sign-in was not verified.');
  return snapshot(await saveSession(envelope.data), envelope.data.created);
}

export async function restoreAccount(): Promise<AccountSnapshot | null> {
  const session = await loadAccountSession();
  if (!session || !apiConfigured()) return null;
  try {
    return await snapshot(session);
  } catch (cause) {
    if (
      cause instanceof ApiContractError &&
      ['invalid_session', 'unauthenticated'].includes(cause.code)
    ) {
      await Preferences.remove({ key: SESSION_KEY });
      return null;
    }
    throw cause;
  }
}

export async function syncAccountSettings(settings: SyncedSettings): Promise<void> {
  const session = await loadAccountSession();
  if (!session || !apiConfigured()) return;
  await apiRequest<SettingsResponse>('/api/settings', {
    method: 'PATCH',
    bearer: session.token,
    body: settings,
  });
}

export async function signOutAccount(): Promise<void> {
  await Preferences.remove({ key: SESSION_KEY });
}
