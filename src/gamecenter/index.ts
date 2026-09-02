import { Capacitor, registerPlugin } from '@capacitor/core';

export const GAME_CENTER_IDS = {
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
} as const;

export interface GameCenterStatus {
  readonly authenticated: boolean;
  readonly displayName: string;
  readonly playerID: string;
}

interface NativeGameCenter {
  authenticate(): Promise<GameCenterStatus>;
  status(): Promise<GameCenterStatus>;
  submitScore(options: { leaderboardID: string; value: number }): Promise<{ submitted: boolean }>;
  unlockAchievement(options: {
    identifier: string;
    percentComplete?: number;
    showsCompletionBanner?: boolean;
  }): Promise<{ submitted: boolean }>;
  showDashboard(): Promise<{ presented: boolean }>;
}

const native = registerPlugin<NativeGameCenter>('MahjongGameCenter');
const unavailable: GameCenterStatus = { authenticated: false, displayName: '', playerID: '' };

export function gameCenterAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

export async function gameCenterStatus(): Promise<GameCenterStatus> {
  if (!gameCenterAvailable()) return unavailable;
  try { return await native.status(); } catch { return unavailable; }
}

export async function connectGameCenter(): Promise<GameCenterStatus> {
  if (!gameCenterAvailable()) return unavailable;
  return native.authenticate();
}

export async function openGameCenter(): Promise<boolean> {
  if (!gameCenterAvailable()) return false;
  try { return (await native.showDashboard()).presented; } catch { return false; }
}

export async function reportGameCenterProgress(input: {
  boardsCleared: number;
  brainIq: number;
  hintsUsed?: number;
  shufflesUsed?: number;
}): Promise<void> {
  if (!gameCenterAvailable()) return;
  const status = await gameCenterStatus();
  if (!status.authenticated) return;

  const submissions: Promise<unknown>[] = [
    native.submitScore({ leaderboardID: GAME_CENTER_IDS.leaderboards.boardsCleared, value: input.boardsCleared }),
    native.submitScore({ leaderboardID: GAME_CENTER_IDS.leaderboards.brainIq, value: input.brainIq }),
  ];

  // Cumulative achievements report PARTIAL progress, not just the moment they
  // complete. Game Center renders that as a progress bar, so a player at seven
  // boards sees 70% of the ten-board achievement instead of nothing followed
  // by a sudden unlock. Reported percentages never decrease on Apple's side,
  // so sending progress on every completed board is safe and is what Apple's
  // own guidance asks for.
  for (const [identifier, target] of [
    [GAME_CENTER_IDS.achievements.firstClear, 1],
    [GAME_CENTER_IDS.achievements.tenBoards, 10],
    [GAME_CENTER_IDS.achievements.fiftyBoards, 50],
  ] as const) {
    const percentComplete = achievementPercent(input.boardsCleared, target);
    // Nothing to say before the first board.
    if (percentComplete <= 0) continue;
    submissions.push(native.unlockAchievement({ identifier, percentComplete }));
  }

  // These two are binary: a board was either cleared without help or it was
  // not. There is no meaningful "40% of a clean clear".
  if (input.hintsUsed === 0) {
    submissions.push(
      native.unlockAchievement({ identifier: GAME_CENTER_IDS.achievements.noHintClear, percentComplete: 100 }),
    );
  }
  if (input.hintsUsed === 0 && input.shufflesUsed === 0) {
    submissions.push(
      native.unlockAchievement({ identifier: GAME_CENTER_IDS.achievements.cleanClear, percentComplete: 100 }),
    );
  }
  await Promise.allSettled(submissions);
}

/**
 * Progress toward a cumulative achievement, 0-100.
 *
 * Clamped at both ends: Game Center rejects a percentage outside that range,
 * and a value above 100 on an already-complete achievement is wasted traffic.
 */
export function achievementPercent(cleared: number, target: number): number {
  if (target <= 0) return 100;
  return Math.min(100, Math.max(0, (cleared / target) * 100));
}
