import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeAccessibilityPreferences {
  readonly textScale: number;
  readonly reduceMotion: boolean;
  readonly increaseContrast: boolean;
}

interface AccessibilityPreferencesNative {
  preferences(): Promise<NativeAccessibilityPreferences>;
  addListener(
    eventName: 'change',
    listener: (preferences: NativeAccessibilityPreferences) => void,
  ): Promise<PluginListenerHandle>;
}

const nativeGlobal = globalThis as typeof globalThis & {
  __mahjongAccessibility?: AccessibilityPreferencesNative;
};
const NativeAccessibility = nativeGlobal.__mahjongAccessibility ??=
  registerPlugin<AccessibilityPreferencesNative>('MahjongAccessibility');

const DEFAULTS: NativeAccessibilityPreferences = {
  textScale: 1,
  reduceMotion: false,
  increaseContrast: false,
};

export function startNativeAccessibilityPreferences(
  onChange: (preferences: NativeAccessibilityPreferences) => void,
): () => void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    onChange(DEFAULTS);
    return () => {};
  }

  let active = true;
  let handle: PluginListenerHandle | null = null;
  void NativeAccessibility.preferences()
    .then((preferences) => {
      if (active) onChange(preferences);
    })
    .catch(() => {
      if (active) onChange(DEFAULTS);
    });
  void NativeAccessibility.addListener('change', (preferences) => {
    if (active) onChange(preferences);
  }).then((listenerHandle) => {
    if (active) handle = listenerHandle;
    else void listenerHandle.remove();
  });

  return () => {
    active = false;
    if (handle) void handle.remove();
  };
}
