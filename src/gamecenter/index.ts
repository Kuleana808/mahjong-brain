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
  if (input.boardsCleared >= 1) submissions.push(native.unlockAchievement({ identifier: GAME_CENTER_IDS.achievements.firstClear }));
  if (input.boardsCleared >= 10) submissions.push(native.unlockAchievement({ identifier: GAME_CENTER_IDS.achievements.tenBoards }));
  if (input.boardsCleared >= 50) submissions.push(native.unlockAchievement({ identifier: GAME_CENTER_IDS.achievements.fiftyBoards }));
  if (input.hintsUsed === 0) submissions.push(native.unlockAchievement({ identifier: GAME_CENTER_IDS.achievements.noHintClear }));
  if (input.hintsUsed === 0 && input.shufflesUsed === 0) submissions.push(native.unlockAchievement({ identifier: GAME_CENTER_IDS.achievements.cleanClear }));
  await Promise.allSettled(submissions);
}
