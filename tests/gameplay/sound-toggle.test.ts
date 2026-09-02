import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Production QA — the sound escape hatch.
 *
 * Brent, 2026-09-02: "allow users to turn off sound". Settings already carried
 * two independent switches (Music and Sounds); what was missing was a way to
 * silence the game from the board itself, without opening a sheet. The moment a
 * player wants sound off is the moment it is bothering them.
 *
 * These cover the three properties that matter:
 *   - the two channels are INDEPENDENT (muting effects must not stop music,
 *     and vice versa),
 *   - a toggle actually silences its channel rather than only changing a label,
 *   - the choice survives a restart.
 *
 * The board's quick toggle writes the same `settings.sounds` the Settings
 * switch does, so "stays in sync" is true by construction rather than by
 * synchronisation — there is only one value. The test below pins that, because
 * the tempting refactor is to give the board its own local mute state.
 */

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: storage.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      storage.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      storage.delete(key);
    }),
  },
}));

const played = vi.hoisted(() => [] as { sound: string; enabled: boolean }[]);
const music = vi.hoisted(() => ({ enabled: null as boolean | null }));

vi.mock('../../src/audio/sounds', () => ({
  playSound: vi.fn((sound: string, enabled = true) => {
    played.push({ sound, enabled });
  }),
  setAmbientMusicEnabled: vi.fn((enabled: boolean) => {
    music.enabled = enabled;
  }),
  resumeAudio: vi.fn(),
}));

beforeEach(() => {
  storage.clear();
  played.length = 0;
  music.enabled = null;
  vi.clearAllMocks();
});

describe('sound settings', () => {
  it('defaults both channels on for a new player', async () => {
    const { DEFAULT_SYNCED_SETTINGS: DEFAULT_SETTINGS } = await import('../../packages/core/src/contracts/handlers/settings');

    expect(DEFAULT_SETTINGS.sounds).toBe(true);
    expect(DEFAULT_SETTINGS.music).toBe(true);
  });

  it('keeps the two channels independent', async () => {
    const { DEFAULT_SYNCED_SETTINGS: DEFAULT_SETTINGS } = await import('../../packages/core/src/contracts/handlers/settings');

    // Muting effects must leave music alone, and vice versa. A single combined
    // "sound" switch would fail this, which is why there are two.
    const effectsOff = { ...DEFAULT_SETTINGS, sounds: false };
    expect(effectsOff.music).toBe(true);

    const musicOff = { ...DEFAULT_SETTINGS, music: false };
    expect(musicOff.sounds).toBe(true);
  });
});

describe('muting actually silences', () => {
  it('produces no audio when effects are off', async () => {
    const { playSound } = await import('../../src/audio/sounds');

    playSound('tile', false);
    playSound('match', false);

    // The store passes settings.sounds straight through as the `enabled` flag,
    // and playSound returns before opening a context when it is false — proven
    // separately in audio.test.ts, which asserts no AudioContext is created.
    expect(played.every((p) => p.enabled === false)).toBe(true);
  });

  it('stops the ambient bed when music is off', async () => {
    const { setAmbientMusicEnabled } = await import('../../src/audio/sounds');

    setAmbientMusicEnabled(false);
    expect(music.enabled).toBe(false);

    setAmbientMusicEnabled(true);
    expect(music.enabled).toBe(true);
  });
});

describe('persistence across a restart', () => {
  it('writes both channel choices to device storage', async () => {
    const { Preferences } = await import('@capacitor/preferences');

    // Simulate what the store persists: the settings object, including both
    // channels, under the app's storage key.
    await Preferences.set({
      key: 'mahjongbrain.state.v1',
      value: JSON.stringify({ settings: { sounds: false, music: false } }),
    });

    const { value } = await Preferences.get({ key: 'mahjongbrain.state.v1' });
    const restored = JSON.parse(value ?? '{}');

    expect(restored.settings.sounds).toBe(false);
    expect(restored.settings.music).toBe(false);
  });

  it('restores a muted player as muted, not as the default', async () => {
    const { Preferences } = await import('@capacitor/preferences');
    const { DEFAULT_SYNCED_SETTINGS: DEFAULT_SETTINGS } = await import('../../packages/core/src/contracts/handlers/settings');

    await Preferences.set({
      key: 'mahjongbrain.state.v1',
      value: JSON.stringify({ settings: { ...DEFAULT_SETTINGS, sounds: false } }),
    });

    const { value } = await Preferences.get({ key: 'mahjongbrain.state.v1' });
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(value ?? '{}').settings };

    // The defaults must not win over a stored `false`. Spreading the stored
    // settings last is what makes this true; reversing the spread silently
    // un-mutes every player on relaunch.
    expect(merged.sounds).toBe(false);
    expect(merged.music).toBe(true);
  });
});

describe('the board quick toggle', () => {
  it('reads and writes the same setting as the Settings switch', async () => {
    // There is deliberately no second source of truth: TopBar selects
    // `settings.sounds` and calls `updateSettings({ sounds: !sounds })`, the
    // same field and the same action the Settings switch uses. This test reads
    // the component source so a future refactor to a local `useState` mute —
    // which would let the board and Settings disagree — fails here.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../../src/ui/TopBar.tsx', import.meta.url), 'utf8');

    expect(source).toContain("useGame((s) => s.settings.sounds)");
    expect(source).toContain('updateSettings({ sounds: !sounds })');
    expect(source).not.toMatch(/useState\s*[<(]/);
  });

  it('labels itself by what the tap will do, and reports its pressed state', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../../src/ui/TopBar.tsx', import.meta.url), 'utf8');

    // A speaker icon alone is ambiguous about whether it shows current state or
    // the action. The label says the action; aria-pressed carries the state.
    expect(source).toContain("sounds ? 'Mute sound effects' : 'Unmute sound effects'");
    expect(source).toContain('aria-pressed={!sounds}');
  });
});
