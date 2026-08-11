/**
 * Game state.
 *
 * The session flow the brief asks for is enforced here, not in the UI: no
 * menu, no login, no mode picker. `start()` deals a board. That is the whole
 * entry path.
 */

import { create } from 'zustand';

import { getHint, type Hint } from '../../packages/core/src/ai/hintCoach';
import {
  availableMoves,
  freeTiles,
  isComplete,
  isStuck,
  removePair,
  type BoardState,
} from '../../packages/core/src/game/board';
import { deal } from '../../packages/core/src/game/deal';
import {
  chooseLayout,
  INITIAL_PROFILE,
  recordOutcome,
  type SkillProfile,
} from '../../packages/core/src/game/difficulty';
import type { LayoutId } from '../../packages/core/src/game/layouts';
import { randomSeed } from '../../packages/core/src/game/rng';
import {
  eventsFor,
  initialState as initialFlowState,
  reduce as reduceFlow,
  type FlowAction,
  type FlowProgress,
  type FlowState,
} from '../../packages/core/src/flow/screens';
import {
  replaySession,
  shuffle as shufflePlaySession,
  startSession,
  tapTile as tapPlayTile,
  type PlaySession,
} from '../../packages/core/src/play/session';
import { purchases, purchasesConfigured } from '../iap';
import {
  appleSignInAvailable,
  restoreAccount,
  signInWithApple,
  signOutAccount,
  syncAccountSettings,
} from '../auth/apple';
import { clearFaceCache } from '../render/boardRenderer';
import { PALETTES, type ThemeName } from '../render/palette';
import { track } from '../telemetry/client';
import { loadPersisted, savePersisted } from './persist';

/** The paywall appears once, after the third completed board. Never before. */
export const PAYWALL_AFTER_BOARDS = 3;

export interface Settings {
  readonly theme: ThemeName;
  /** 1.0 = system default. The UI scales with it; so does the tile art. */
  readonly fontScale: number;
  readonly reduceMotion: boolean;
  /** Dim tiles that cannot be picked up. On by default — it removes a decision. */
  readonly dimBlocked: boolean;
  readonly haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'calm',
  fontScale: 1,
  reduceMotion: false,
  dimBlocked: true,
  haptics: true,
};

interface SessionStats {
  startedAt: number;
  movesPlayed: number;
  hintsUsed: number;
}

export type Status = 'idle' | 'playing' | 'stuck' | 'complete' | 'holder_full';

interface GameStore {
  flow: FlowState;
  board: BoardState | null;
  holder: readonly number[];
  tapHistory: readonly number[];
  status: Status;
  selectedId: number | null;
  hint: Hint | null;
  hintPending: boolean;
  /** Announced to screen readers via aria-live. */
  announcement: string;

  settings: Settings;
  profile: SkillProfile;
  boardsCompleted: number;
  unlocked: boolean;
  paywallOpen: boolean;
  settingsOpen: boolean;
  hydrated: boolean;
  accountStatus: 'unavailable' | 'signed_out' | 'signing_in' | 'signed_in';
  accountId: string | null;
  accountError: string | null;

  session: SessionStats;

  hydrate(): Promise<void>;
  dispatchFlow(action: FlowAction): void;
  start(layoutId?: LayoutId): void;
  tapTile(id: number): void;
  clearSelection(): void;
  requestHint(): Promise<void>;
  dismissHint(): void;
  undo(): void;
  shuffleBoard(): void;
  updateSettings(patch: Partial<Settings>): void;
  openSettings(open: boolean): void;
  closePaywall(): void;
  buy(): Promise<void>;
  restore(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const freshSession = (): SessionStats => ({
  startedAt: Date.now(),
  movesPlayed: 0,
  hintsUsed: 0,
});

function statusFor(board: BoardState): Status {
  if (isComplete(board)) return 'complete';
  if (isStuck(board)) return 'stuck';
  return 'playing';
}

function statusForPlaySession(session: PlaySession): Status {
  if (session.status === 'won') return 'complete';
  if (session.status === 'holder_full') return 'holder_full';
  return 'playing';
}

function playSessionFromState(
  board: BoardState,
  holder: readonly number[],
  status: Status,
): PlaySession {
  return {
    board,
    holder,
    status: status === 'holder_full' ? 'holder_full' : status === 'complete' ? 'won' : 'playing',
    cleared: board.removed.length * 2,
    revivesUsed: 0,
    shufflesUsed: 0,
    hintsUsed: 0,
  };
}

const syncedSettings = (settings: Settings) => ({
  ...settings,
  difficultyPreference: 'auto' as const,
});

export const useGame = create<GameStore>((set, get) => {
  const persist = () => {
    const s = get();
    void savePersisted({
      version: 1,
      settings: s.settings,
      progress: {
        flow: s.flow.progress,
        profile: s.profile,
        boardsCompleted: s.boardsCompleted,
        unlocked: s.unlocked,
      },
      resume: s.board
        ? {
            layoutId: s.board.layoutId,
            seed: s.board.seed,
            removed: s.board.removed,
            taps: s.tapHistory,
            session: s.session,
          }
        : null,
    });
  };

  return {
    flow: initialFlowState(),
    board: null,
    holder: [],
    tapHistory: [],
    status: 'idle',
    selectedId: null,
    hint: null,
    hintPending: false,
    announcement: '',

    settings: DEFAULT_SETTINGS,
    profile: INITIAL_PROFILE,
    boardsCompleted: 0,
    unlocked: false,
    paywallOpen: false,
    settingsOpen: false,
    hydrated: false,
    accountStatus: appleSignInAvailable() ? 'signed_out' : 'unavailable',
    accountId: null,
    accountError: null,

    session: freshSession(),

    dispatchFlow(action) {
      const before = get().flow;
      const after = reduceFlow(before, action);
      if (after === before) return;

      // The flow machine owns sequencing and its closed event catalogue keeps
      // UI screens from silently shipping without instrumentation.
      for (const name of eventsFor(action, before, after)) {
        void track(name, { screen: after.screen });
        if (import.meta.env.DEV) console.debug('[flow]', name);
      }

      set({ flow: after });
      // Home doubles as the pause surface. Returning to an active board must
      // preserve its seed, holder, and move history; only a finished/absent
      // session receives a fresh deal.
      if (action.type === 'start_board' && (!get().board || get().status !== 'playing')) {
        get().start();
      }
      persist();
    },

    async hydrate() {
      const saved = await loadPersisted();
      const settings = {
        ...DEFAULT_SETTINGS,
        // Honour the OS preference unless the player has overridden it.
        reduceMotion:
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        ...((saved?.settings as Partial<Settings>) ?? {}),
      };
      const progress = (saved?.progress ?? {}) as {
        flow?: FlowProgress;
        profile?: SkillProfile;
        boardsCompleted?: number;
        unlocked?: boolean;
      };

      const unlocked = progress.unlocked || (await purchases().isUnlocked());
      const account = await restoreAccount();
      const remoteSettings = account?.settings?.settings;

      const storedBoardsCompleted = progress.boardsCompleted ?? progress.flow?.boardsCompleted ?? 0;
      const reconciledFlow = progress.flow
        ? { ...progress.flow, boardsCompleted: storedBoardsCompleted }
        : progress.flow;

      set({
        flow: initialFlowState(reconciledFlow),
        settings: remoteSettings ? { ...settings, ...remoteSettings, theme: remoteSettings.theme === 'system' ? 'calm' : remoteSettings.theme } : settings,
        profile: progress.profile ?? INITIAL_PROFILE,
        boardsCompleted: storedBoardsCompleted,
        unlocked: unlocked || account?.unlock?.unlocked === true,
        accountStatus: account ? 'signed_in' : appleSignInAvailable() ? 'signed_out' : 'unavailable',
        accountId: account?.session.accountId ?? null,
        hydrated: true,
      });

      // Restore a board if one exists. Otherwise pre-deal the first board so
      // Start is instant after onboarding; the flow still prevents it from
      // being shown or interacted with before the legal/tutorial gates.
      const resume = saved?.resume as
        | {
            layoutId: LayoutId;
            seed: number;
            removed: [number, number][];
            taps?: number[];
            session: SessionStats;
          }
        | null
        | undefined;

      if (resume?.layoutId) {
        const restored = resume.taps
          ? replaySession(resume.layoutId, resume.seed, resume.taps)
          : null;
        if (restored) {
          const currentFlow = get().flow;
          const canResumeBoard = currentFlow.screen === 'home';
          set({
            flow: canResumeBoard
              ? {
                  ...currentFlow,
                  screen: restored.status === 'playing' ? 'gameplay' : 'game_over',
                }
              : currentFlow,
            board: restored.board,
            holder: restored.holder,
            tapHistory: resume.taps ?? [],
            status: statusForPlaySession(restored),
            session: resume.session ?? freshSession(),
          });
        } else if (resume.taps) {
          get().start(resume.layoutId);
        } else {
          let board = deal(resume.layoutId, resume.seed);
          for (const [a, b] of resume.removed) board = removePair(board, a, b);
          set({
            board,
            holder: [],
            tapHistory: [],
            status: statusFor(board),
            session: resume.session ?? freshSession(),
          });
        }
      } else {
        get().start();
      }
    },

    start(layoutId) {
      const { profile } = get();
      const chosen = layoutId ?? chooseLayout(profile);
      const play = startSession(chosen, randomSeed());
      set({
        board: play.board,
        holder: play.holder,
        tapHistory: [],
        status: 'playing',
        selectedId: null,
        hint: null,
        session: freshSession(),
        announcement: `New board. ${play.board.remaining.size} tiles.`,
      });
      persist();
    },

    tapTile(id) {
      const { board, holder, tapHistory, settings, status } = get();
      if (!board || !board.remaining.has(id) || status !== 'playing') return;

      const play = playSessionFromState(board, holder, status);
      const next = tapPlayTile(play, id);
      if (next === play) {
        void track('tile_tap_rejected', {
          layout: board.layoutId,
          seed: board.seed,
          holderCount: holder.length,
          tilesRemaining: board.remaining.size,
          reason: 'blocked',
        });
        set({ announcement: 'That tile is blocked. Try one with an open side.' });
        return;
      }

      void track('tile_tap', {
        layout: board.layoutId,
        seed: board.seed,
        holderCount: next.holder.length,
        tilesRemaining: next.board.remaining.size,
      });
      if (next.board.removed.length > board.removed.length) {
        void track('pair_cleared', {
          layout: board.layoutId,
          seed: board.seed,
          holderCount: next.holder.length,
          tilesRemaining: next.board.remaining.size,
          cleared: next.board.removed.length * 2,
        });
      } else {
        void track('holder_slot_filled', {
          layout: board.layoutId,
          seed: board.seed,
          holderCount: next.holder.length,
          tilesRemaining: next.board.remaining.size,
        });
      }

      const nextStatus = statusForPlaySession(next);
      const session = { ...get().session, movesPlayed: get().session.movesPlayed + 1 };
      if (settings.haptics) void tap();

      set({
        board: next.board,
        holder: next.holder,
        tapHistory: [...tapHistory, id],
        selectedId: null,
        hint: null,
        status: nextStatus,
        session,
        announcement:
          nextStatus === 'complete'
            ? 'Board complete.'
            : nextStatus === 'holder_full'
              ? 'The holder is full.'
              : next.holder.length === 3
                ? 'Three of four holder slots filled.'
                : `${next.board.remaining.size} tiles left.`,
      });

      if (nextStatus === 'complete') {
        finishBoard(true);
        get().dispatchFlow({ type: 'board_won' });
      } else if (nextStatus === 'holder_full') {
        get().dispatchFlow({ type: 'holder_full' });
      }
      persist();
    },

    clearSelection() {
      set({ selectedId: null });
    },

    async requestHint() {
      const { board, unlocked, hintPending } = get();
      if (!board || hintPending) return;

      void track('hint_tapped', { layout: board.layoutId, seed: board.seed });
      set({ hintPending: true });
      const hint = await getHint(board, { allowModelPhrasing: unlocked });
      if (hint) void track('hint_shown', { layout: board.layoutId, seed: board.seed });
      set((s) => ({
        hint,
        hintPending: false,
        session: { ...s.session, hintsUsed: s.session.hintsUsed + 1 },
        announcement: hint?.summary ?? 'No pairs available.',
      }));
    },

    dismissHint() {
      set({ hint: null });
    },

    undo() {
      const { board, tapHistory } = get();
      if (!board || tapHistory.length === 0) return;
      const taps = tapHistory.slice(0, -1);
      const next = replaySession(board.layoutId, board.seed, taps);
      if (!next) return;
      set({
        board: next.board,
        holder: next.holder,
        tapHistory: taps,
        status: statusForPlaySession(next),
        selectedId: null,
        hint: null,
        announcement: 'Move undone.',
      });
      persist();
    },

    shuffleBoard() {
      const { board, holder, status } = get();
      if (!board) return;
      void track('shuffle_tapped', { layout: board.layoutId, seed: board.seed });
      const play = playSessionFromState(board, holder, status);
      const next = shufflePlaySession(play, randomSeed());
      if (next === play) return;
      void track('shuffle_granted', { layout: board.layoutId, seed: board.seed });
      set({
        board: next.board,
        holder: next.holder,
        tapHistory: [],
        status: statusForPlaySession(next),
        selectedId: null,
        hint: null,
        announcement: 'Tiles reshuffled.',
      });
      persist();
    },

    updateSettings(patch) {
      if (patch.theme) clearFaceCache();
      for (const key of Object.keys(patch)) void track('setting_changed', { settingKey: key });
      set((s) => ({ settings: { ...s.settings, ...patch } }));
      persist();
      void syncAccountSettings(syncedSettings(get().settings)).catch(() => {
        // Local settings remain authoritative while offline; the next change
        // or sign-in retries without interrupting play.
      });
    },

    openSettings(open) {
      if (open) void track('settings_opened');
      set({ settingsOpen: open });
    },

    closePaywall() {
      set({ paywallOpen: false });
    },

    async buy() {
      const result = await purchases().purchase();
      if (result.status === 'purchased' || result.status === 'restored') {
        set({ unlocked: true, paywallOpen: false, announcement: 'Unlocked. Thank you.' });
        persist();
      } else if (result.status !== 'cancelled') {
        set({ announcement: result.message ?? 'Purchase could not be completed.' });
      }
    },

    async restore() {
      const result = await purchases().restore();
      if (result.status === 'restored' || result.status === 'purchased') {
        set({ unlocked: true, paywallOpen: false, announcement: 'Purchase restored.' });
        persist();
      } else {
        set({ announcement: result.message ?? 'No purchase to restore.' });
      }
    },

    async signIn() {
      if (!appleSignInAvailable()) {
        set({ accountStatus: 'unavailable', accountError: 'Sign in is not configured in this build.' });
        return;
      }
      set({ accountStatus: 'signing_in', accountError: null });
      try {
        const account = await signInWithApple();
        if (account.created) {
          await syncAccountSettings(syncedSettings(get().settings));
        } else if (account.settings) {
          const remote = account.settings.settings;
          set((s) => ({
            settings: {
              ...s.settings,
              ...remote,
              theme: remote.theme === 'system' ? 'calm' : remote.theme,
            },
          }));
        }
        set((s) => ({
          accountStatus: 'signed_in',
          accountId: account.session.accountId,
          accountError: null,
          unlocked: s.unlocked || account.unlock?.unlocked === true,
          announcement: 'Signed in with Apple. Settings and unlock status are protected.',
        }));
        persist();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Sign in could not be completed.';
        set({
          accountStatus: 'signed_out',
          accountError: message === 'Sign in was cancelled.' ? null : message,
          announcement: message,
        });
      }
    },

    async signOut() {
      await signOutAccount();
      set({
        accountStatus: appleSignInAvailable() ? 'signed_out' : 'unavailable',
        accountId: null,
        accountError: null,
        announcement: 'Signed out. Your game remains on this device.',
      });
    },
  };

  /** Rolls the finished board into the skill profile and decides on the paywall. */
  function finishBoard(completed: boolean) {
    const { board, session, profile, boardsCompleted, unlocked } = get();
    if (!board) return;

    const nextProfile = recordOutcome(profile, {
      layoutId: board.layoutId,
      completed,
      movesPlayed: session.movesPlayed,
      hintsUsed: session.hintsUsed,
      elapsedSeconds: (Date.now() - session.startedAt) / 1000,
    });
    const total = boardsCompleted + (completed ? 1 : 0);

    set({
      profile: nextProfile,
      boardsCompleted: total,
      // Once, after the third finished board, and never for someone who has
      // already paid. Not before a board, not mid-board, not on a timer.
      paywallOpen:
        purchasesConfigured() && !unlocked && completed && total === PAYWALL_AFTER_BOARDS,
    });
  }
});

/** Haptics are best-effort and never block a move. */
async function tap(): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // No haptics engine (web, simulator) — silently fine.
  }
}

// Dev-only handle, so a state that takes three boards to reach can be inspected
// in one line from the console. Stripped from production builds.
if (import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).__mahjongBrain = useGame;
}

/** Convenience selector: the palette for the current theme. */
export const selectPalette = (s: GameStore) => PALETTES[s.settings.theme];

/** Convenience selector: ids the player can act on right now. */
export function selectFreeIds(s: GameStore): Set<number> {
  if (!s.board) return new Set();
  return new Set(freeTiles(s.board).map((t) => t.id));
}

export function selectMovesAvailable(s: GameStore): number {
  return s.board ? availableMoves(s.board).length : 0;
}
