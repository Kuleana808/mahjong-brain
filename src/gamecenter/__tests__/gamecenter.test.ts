import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Game Center was the one flow named in the release checklist with no test
 * coverage at all, and it is the flow whose identifiers are already live in
 * App Store Connect — a wrong identifier or a wrongly-granted achievement is
 * visible to players and cannot be recalled.
 *
 * The property these tests exist to protect is the achievement semantics.
 * `noHintClear` and `cleanClear` mean "cleared a board without help". Nothing
 * in `reportGameCenterProgress` itself checks that a board was cleared — that
 * guard lives in the caller (`store.ts` wraps the call in `if (completed)`).
 * The other caller, `Overlays.tsx:287`, fires when a player connects Game
 * Center from the UI and omits `hintsUsed`/`shufflesUsed` entirely.
 *
 * That combination is safe only because `undefined === 0` is false, so an
 * omitted field cannot satisfy the unlock condition. It is safe by strict
 * equality rather than by design, and a well-meaning refactor to
 * `!input.hintsUsed` or `(input.hintsUsed ?? 0) === 0` would silently start
 * granting "cleared without a hint" to players who had not cleared anything.
 * The omitted-fields test below is the tripwire for exactly that change.
 */

const native = vi.hoisted(() => ({
  authenticate: vi.fn(),
  status: vi.fn(),
  submitScore: vi.fn(),
  unlockAchievement: vi.fn(),
  showDashboard: vi.fn(),
}));

const platform = vi.hoisted(() => ({ native: true, name: 'ios' }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
  },
  registerPlugin: () => native,
}));

const UNAVAILABLE = { authenticated: false, displayName: '', playerID: '' };
const AUTHED = { authenticated: true, displayName: 'Player One', playerID: 'G:1' };

beforeEach(() => {
  platform.native = true;
  platform.name = 'ios';
  vi.clearAllMocks();
  native.status.mockResolvedValue(AUTHED);
  native.authenticate.mockResolvedValue(AUTHED);
  native.submitScore.mockResolvedValue({ submitted: true });
  native.unlockAchievement.mockResolvedValue({ submitted: true });
  native.showDashboard.mockResolvedValue({ presented: true });
});

async function load() {
  return import('../index');
}

/** Achievement identifiers passed to unlockAchievement during a call. */
function unlocked(): string[] {
  return native.unlockAchievement.mock.calls.map((call) => call[0].identifier);
}

describe('platform availability', () => {
  it('is unavailable off-device, so the browser build never calls the bridge', async () => {
    platform.native = false;
    const gc = await load();

    expect(gc.gameCenterAvailable()).toBe(false);
    await expect(gc.gameCenterStatus()).resolves.toEqual(UNAVAILABLE);
    await expect(gc.connectGameCenter()).resolves.toEqual(UNAVAILABLE);
    await expect(gc.openGameCenter()).resolves.toBe(false);

    expect(native.status).not.toHaveBeenCalled();
    expect(native.authenticate).not.toHaveBeenCalled();
    expect(native.showDashboard).not.toHaveBeenCalled();
  });

  it('is unavailable on a non-iOS native platform', async () => {
    platform.native = true;
    platform.name = 'android';
    const gc = await load();

    expect(gc.gameCenterAvailable()).toBe(false);
    await expect(gc.gameCenterStatus()).resolves.toEqual(UNAVAILABLE);
  });
});

describe('status and dashboard degrade rather than throw', () => {
  it('reports unavailable when the native status call rejects', async () => {
    native.status.mockRejectedValue(new Error('GameKit unavailable'));
    const gc = await load();

    await expect(gc.gameCenterStatus()).resolves.toEqual(UNAVAILABLE);
  });

  it('reports the dashboard as not presented when the bridge rejects', async () => {
    native.showDashboard.mockRejectedValue(new Error('no view controller'));
    const gc = await load();

    await expect(gc.openGameCenter()).resolves.toBe(false);
  });

  it('lets an authentication failure surface, because the UI reports it', async () => {
    // connectGameCenter is called from a button with its own try/catch that
    // renders the message. Swallowing here would show a silent no-op instead.
    native.authenticate.mockRejectedValue(new Error('player cancelled'));
    const gc = await load();

    await expect(gc.connectGameCenter()).rejects.toThrow('player cancelled');
  });
});

describe('score submission', () => {
  it('submits both leaderboards with the App Store Connect identifiers', async () => {
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 4, brainIq: 118 });

    expect(native.submitScore).toHaveBeenCalledWith({
      leaderboardID: 'com.nihi.mahjong.boardsCleared',
      value: 4,
    });
    expect(native.submitScore).toHaveBeenCalledWith({
      leaderboardID: 'com.nihi.mahjong.brainIq',
      value: 118,
    });
  });

  it('submits nothing at all when the player is not authenticated', async () => {
    native.status.mockResolvedValue(UNAVAILABLE);
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 50, brainIq: 140, hintsUsed: 0, shufflesUsed: 0 });

    expect(native.submitScore).not.toHaveBeenCalled();
    expect(native.unlockAchievement).not.toHaveBeenCalled();
  });

  it('does not reject when one submission fails, so a board completion is never blocked', async () => {
    native.submitScore.mockRejectedValueOnce(new Error('network'));
    const gc = await load();

    await expect(
      gc.reportGameCenterProgress({ boardsCleared: 10, brainIq: 120, hintsUsed: 0, shufflesUsed: 0 }),
    ).resolves.toBeUndefined();

    // The remaining submissions still went out.
    expect(unlocked()).toContain('com.nihi.mahjong.tenBoards');
  });
});

describe('achievement thresholds', () => {
  it('grants nothing on a zero-board report', async () => {
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 0, brainIq: 100 });

    expect(unlocked()).toEqual([]);
  });

  it('grants firstClear at one board and nothing above it', async () => {
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 1, brainIq: 102 });

    expect(unlocked()).toEqual(['com.nihi.mahjong.firstClear']);
  });

  it('grants the ten-board tier cumulatively at ten', async () => {
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 10, brainIq: 110 });

    expect(unlocked()).toEqual([
      'com.nihi.mahjong.firstClear',
      'com.nihi.mahjong.tenBoards',
    ]);
  });

  it('grants every tier at fifty boards', async () => {
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 50, brainIq: 130 });

    expect(unlocked()).toEqual([
      'com.nihi.mahjong.firstClear',
      'com.nihi.mahjong.tenBoards',
      'com.nihi.mahjong.fiftyBoards',
    ]);
  });

  it('does not grant the ten-board tier at nine', async () => {
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 9, brainIq: 108 });

    expect(unlocked()).not.toContain('com.nihi.mahjong.tenBoards');
  });
});

describe('assistance-free achievements', () => {
  it('grants noHintClear when the cleared board used no hints', async () => {
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 3, brainIq: 105, hintsUsed: 0, shufflesUsed: 2 });

    expect(unlocked()).toContain('com.nihi.mahjong.noHintClear');
    expect(unlocked()).not.toContain('com.nihi.mahjong.cleanClear');
  });

  it('grants cleanClear only when neither hints nor shuffles were used', async () => {
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 3, brainIq: 105, hintsUsed: 0, shufflesUsed: 0 });

    expect(unlocked()).toContain('com.nihi.mahjong.noHintClear');
    expect(unlocked()).toContain('com.nihi.mahjong.cleanClear');
  });

  it('withholds both when the player took a hint', async () => {
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 3, brainIq: 105, hintsUsed: 1, shufflesUsed: 0 });

    expect(unlocked()).not.toContain('com.nihi.mahjong.noHintClear');
    expect(unlocked()).not.toContain('com.nihi.mahjong.cleanClear');
  });

  /**
   * The tripwire. `Overlays.tsx:287` reports progress when a player connects
   * Game Center from the UI, passing only boardsCleared and brainIq — there is
   * no board completion behind that call and no hint counters to send.
   *
   * Omitted counters must never satisfy an assistance-free unlock. If this
   * test fails, someone has changed a strict `=== 0` into a falsy or
   * null-coalescing check, and the app is now telling players they cleared a
   * board without help when they may not have cleared a board at all.
   */
  it('never grants assistance-free achievements when the counters are omitted', async () => {
    const gc = await load();

    await gc.reportGameCenterProgress({ boardsCleared: 12, brainIq: 115 });

    expect(unlocked()).toContain('com.nihi.mahjong.firstClear');
    expect(unlocked()).toContain('com.nihi.mahjong.tenBoards');
    expect(unlocked()).not.toContain('com.nihi.mahjong.noHintClear');
    expect(unlocked()).not.toContain('com.nihi.mahjong.cleanClear');
  });
});

describe('identifier catalogue', () => {
  /**
   * Every identifier below is already created in App Store Connect. A typo
   * here submits into a leaderboard that does not exist and fails silently on
   * device, which is the hardest class of bug to notice after launch.
   */
  it('matches the identifiers registered in App Store Connect', async () => {
    const { GAME_CENTER_IDS } = await load();

    expect(GAME_CENTER_IDS).toEqual({
      leaderboards: {
        boardsCleared: 'com.nihi.mahjong.boardsCleared',
        brainIq: 'com.nihi.mahjong.brainIq',
      },
      achievements: {
        firstClear: 'com.nihi.mahjong.firstClear',
        tenBoards: 'com.nihi.mahjong.tenBoards',
        fiftyBoards: 'com.nihi.mahjong.fiftyBoards',
        noHintClear: 'com.nihi.mahjong.noHintClear',
        cleanClear: 'com.nihi.mahjong.cleanClear',
      },
    });
  });

  it('namespaces every identifier under the shipping bundle id', async () => {
    const { GAME_CENTER_IDS } = await load();
    const all = [
      ...Object.values(GAME_CENTER_IDS.leaderboards),
      ...Object.values(GAME_CENTER_IDS.achievements),
    ];

    expect(all).toHaveLength(7);
    for (const id of all) expect(id.startsWith('com.nihi.mahjong.')).toBe(true);
  });
});
