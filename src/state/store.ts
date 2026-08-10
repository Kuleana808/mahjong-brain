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
  undoLast,
  type BoardState,
} from '../../packages/core/src/game/board';
import { canReshuffle, deal, reshuffle } from '../../packages/core/src/game/deal';
import {
  chooseLayout,
  INITIAL_PROFILE,
  recordOutcome,
  type SkillProfile,
} from '../../packages/core/src/game/difficulty';
import type { LayoutId } from '../../packages/core/src/game/layouts';
import { randomSeed } from '../../packages/core/src/game/rng';
import { purchases } from '../iap';
import { clearFaceCache } from '../render/boardRenderer';
import { PALETTES, type ThemeName } from '../render/palette';
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

export type Status = 'idle' | 'playing' | 'stuck' | 'complete';

interface GameStore {
  board: BoardState | null;
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

  session: SessionStats;

  hydrate(): Promise<void>;
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

export const useGame = create<GameStore>((set, get) => {
  const persist = () => {
    const s = get();
    void savePersisted({
      version: 1,
      settings: s.settings,
      progress: {
        profile: s.profile,
        boardsCompleted: s.boardsCompleted,
        unlocked: s.unlocked,
      },
      resume: s.board
        ? {
            layoutId: s.board.layoutId,
            seed: s.board.seed,
            removed: s.board.removed,
            session: s.session,
          }
        : null,
    });
  };

  return {
    board: null,
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

    session: freshSession(),

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
        profile?: SkillProfile;
        boardsCompleted?: number;
        unlocked?: boolean;
      };

      const unlocked = progress.unlocked || (await purchases().isUnlocked());

      set({
        settings,
        profile: progress.profile ?? INITIAL_PROFILE,
        boardsCompleted: progress.boardsCompleted ?? 0,
        unlocked,
        hydrated: true,
      });

      // Restore a board that was in progress; otherwise deal a new one. Either
      // way the player lands on a playable board with no decision to make.
      const resume = saved?.resume as
        | { layoutId: LayoutId; seed: number; removed: [number, number][]; session: SessionStats }
        | null
        | undefined;

      if (resume?.layoutId) {
        let board = deal(resume.layoutId, resume.seed);
        for (const [a, b] of resume.removed) board = removePair(board, a, b);
        set({
          board,
          status: statusFor(board),
          session: resume.session ?? freshSession(),
        });
      } else {
        get().start();
      }
    },

    start(layoutId) {
      const { profile } = get();
      const chosen = layoutId ?? chooseLayout(profile);
      const board = deal(chosen, randomSeed());
      set({
        board,
        status: 'playing',
        selectedId: null,
        hint: null,
        session: freshSession(),
        announcement: `New board. ${board.remaining.size} tiles.`,
      });
      persist();
    },

    tapTile(id) {
      const { board, selectedId, settings } = get();
      if (!board || !board.remaining.has(id)) return;

      if (selectedId === null) {
        const free = new Set(freeTiles(board).map((t) => t.id));
        if (!free.has(id)) {
          set({ announcement: 'That tile is blocked. Try one with an open side.' });
          return;
        }
        set({ selectedId: id, announcement: '' });
        return;
      }

      if (selectedId === id) {
        set({ selectedId: null });
        return;
      }

      const next = removePair(board, selectedId, id);
      if (next === board) {
        // Not a legal pair — treat the tap as picking a new tile rather than
        // scolding the player. One less thing to think about.
        set({ selectedId: id, announcement: 'Not a match.' });
        return;
      }

      const status = statusFor(next);
      const session = { ...get().session, movesPlayed: get().session.movesPlayed + 1 };

      if (settings.haptics) void tap();

      set({
        board: next,
        selectedId: null,
        hint: null,
        status,
        session,
        announcement:
          status === 'complete'
            ? 'Board complete.'
            : status === 'stuck'
              ? 'No pairs left. Shuffle to keep going.'
              : `${next.remaining.size} tiles left.`,
      });

      if (status === 'complete') finishBoard(true);
      persist();
    },

    clearSelection() {
      set({ selectedId: null });
    },

    async requestHint() {
      const { board, unlocked, hintPending } = get();
      if (!board || hintPending) return;

      set({ hintPending: true });
      const hint = await getHint(board, { allowModelPhrasing: unlocked });
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
      const { board } = get();
      if (!board) return;
      const next = undoLast(board);
      if (next === board) return;
      set({
        board: next,
        status: statusFor(next),
        selectedId: null,
        hint: null,
        announcement: 'Move undone.',
      });
      persist();
    },

    shuffleBoard() {
      const { board } = get();
      if (!board) return;

      // Late in a board the last tiles can end up stacked, and no arrangement
      // of faces makes a stacked pair takeable. Say so and count the board as
      // played rather than offering a button that does nothing.
      if (!canReshuffle(board)) {
        finishBoard(false);
        set({
          announcement: 'These last tiles cannot be freed. Starting a fresh board.',
        });
        get().start();
        return;
      }

      const next = reshuffle(board, randomSeed());
      set({
        board: next,
        status: statusFor(next),
        selectedId: null,
        hint: null,
        announcement: 'Tiles reshuffled.',
      });
      persist();
    },

    updateSettings(patch) {
      if (patch.theme) clearFaceCache();
      set((s) => ({ settings: { ...s.settings, ...patch } }));
      persist();
    },

    openSettings(open) {
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
      paywallOpen: !unlocked && completed && total === PAYWALL_AFTER_BOARDS,
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
