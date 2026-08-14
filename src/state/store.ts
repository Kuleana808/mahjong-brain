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
import { LAYOUTS, type LayoutId } from '../../packages/core/src/game/layouts';
import { randomSeed } from '../../packages/core/src/game/rng';
import {
  INITIAL_PROGRESSION,
  recordBoard,
  type Progression,
} from '../../packages/core/src/progression/progression';
import {
  eventsFor,
  initialState as initialFlowState,
  reduce as reduceFlow,
  type FlowAction,
  type FlowProgress,
  type FlowState,
} from '../../packages/core/src/flow/screens';
import {
  hintPair as holderHintPair,
  replaySession,
  revive as revivePlaySession,
  shuffle as shufflePlaySession,
  startSession,
  tapTile as tapPlayTile,
  type PlaySession,
} from '../../packages/core/src/play/session';
import { faceName } from '../../packages/core/src/game/tiles';
import { purchases, purchasesConfigured } from '../iap';
import { playSound } from '../audio/sounds';
import {
  appleSignInAvailable,
  restoreAccount,
  signInWithApple,
  signOutAccount,
  syncAccountSettings,
} from '../auth/apple';
import { clearFaceCache } from '../render/boardRenderer';
import { PALETTES, type ThemeName, type TileStyleName } from '../render/palette';
import { track } from '../telemetry/client';
import type { GrantKind } from '../../packages/core/src/contracts/types';
import { flushPersisted, loadPersisted, savePersisted } from './persist';

/** The paywall appears once, after the third completed board. Never before. */
export const PAYWALL_AFTER_BOARDS = 3;

export interface Settings {
  readonly theme: ThemeName;
  readonly tileStyle: TileStyleName;
  /** 1.0 = system default. The UI scales with it; so does the tile art. */
  readonly fontScale: number;
  readonly reduceMotion: boolean;
  /** Dim tiles that cannot be picked up. On by default — it removes a decision. */
  readonly dimBlocked: boolean;
  readonly haptics: boolean;
  readonly sounds: boolean;
}

export interface Inventory {
  readonly hint: number;
  readonly shuffle: number;
  readonly revive: number;
}

export const DEFAULT_INVENTORY: Inventory = { hint: 3, shuffle: 1, revive: 0 };

export const DEFAULT_SETTINGS: Settings = {
  theme: 'calm',
  tileStyle: 'ivory',
  fontScale: 1,
  reduceMotion: false,
  dimBlocked: true,
  haptics: true,
  sounds: true,
};

interface SessionStats {
  startedAt: number;
  movesPlayed: number;
  hintsUsed: number;
  shufflesUsed: number;
  revivesUsed: number;
}

export type Status = 'idle' | 'playing' | 'stuck' | 'complete' | 'holder_full';

interface UndoBaseline {
  readonly board: BoardState;
  readonly holder: readonly number[];
  readonly status: Status;
}

interface GameStore {
  flow: FlowState;
  board: BoardState | null;
  holder: readonly number[];
  tapHistory: readonly number[];
  undoBaseline: UndoBaseline | null;
  status: Status;
  selectedId: number | null;
  hint: Hint | null;
  hintPending: boolean;
  /** Announced to screen readers via aria-live. */
  announcement: string;

  settings: Settings;
  inventory: Inventory;
  profile: SkillProfile;
  progression: Progression;
  boardsCompleted: number;
  /** StoreKit entitlement owned by the Apple ID on this device. */
  deviceUnlocked: boolean;
  unlocked: boolean;
  purchasePending: 'buying' | 'restoring' | null;
  purchaseDisplayPrice: string | null;
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
  newBoard(layoutId?: LayoutId): void;
  tapTile(id: number): void;
  clearSelection(): void;
  dismissAnnouncement(): void;
  requestHint(): Promise<void>;
  dismissHint(): void;
  undo(): void;
  shuffleBoard(): void;
  useRevive(): void;
  updateSettings(patch: Partial<Settings>): void;
  grantInventory(kind: GrantKind, quantity: number): void;
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
  shufflesUsed: 0,
  revivesUsed: 0,
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

function replayFromBaseline(baseline: UndoBaseline, taps: readonly number[]): PlaySession | null {
  let session = playSessionFromState(baseline.board, baseline.holder, baseline.status);
  for (const id of taps) {
    const next = tapPlayTile(session, id);
    if (next === session) return null;
    session = next;
  }
  return session;
}

const syncedSettings = (settings: Settings) => ({
  theme: settings.theme,
  fontScale: settings.fontScale,
  reduceMotion: settings.reduceMotion,
  dimBlocked: settings.dimBlocked,
  haptics: settings.haptics,
  sounds: settings.sounds,
  difficultyPreference: 'auto' as const,
});

function isPersistedBoard(
  board: Omit<BoardState, 'remaining'> & { remaining: number[] },
  holder: readonly number[],
): boolean {
  if (!Object.hasOwn(LAYOUTS, board.layoutId) || !Number.isSafeInteger(board.seed)) return false;
  if (!Array.isArray(board.tiles) || board.tiles.length !== LAYOUTS[board.layoutId].cells.length) return false;
  const maxRank: Record<string, number> = { bamboo: 9, character: 9, circle: 9, wind: 4, dragon: 3, flower: 4, season: 4 };
  const ids = new Set<number>();
  for (const tile of board.tiles) {
    if (!Number.isSafeInteger(tile.id) || ids.has(tile.id)) return false;
    if (![tile.x, tile.y, tile.z, tile.face?.rank].every(Number.isFinite)) return false;
    if (!maxRank[tile.face.suit] || tile.face.rank < 1 || tile.face.rank > maxRank[tile.face.suit]) return false;
    ids.add(tile.id);
  }
  if (!Array.isArray(board.remaining) || !board.remaining.every((id) => ids.has(id))) return false;
  const remaining = new Set(board.remaining);
  if (remaining.size !== board.remaining.length) return false;
  if (!Array.isArray(holder) || !holder.every((id) => ids.has(id) && !remaining.has(id))) return false;
  return holder.length <= 4;
}

function persistedStatus(board: BoardState, holder: readonly number[]): Status {
  if (board.remaining.size === 0 && holder.length === 0) return 'complete';
  if (holder.length >= 4) return 'holder_full';
  return 'playing';
}

export const useGame = create<GameStore>((set, get) => {
  const persist = () => {
    const s = get();
    void savePersisted({
      version: 1,
      settings: s.settings,
      progress: {
        flow: s.flow.progress,
        profile: s.profile,
        progression: s.progression,
        boardsCompleted: s.boardsCompleted,
        deviceUnlocked: s.deviceUnlocked,
        unlocked: s.unlocked,
        inventory: s.inventory,
      },
      resume: s.board
        ? {
            board: {
              ...s.board,
              remaining: [...s.board.remaining],
            },
            holder: s.holder,
            tapHistory: s.tapHistory,
            undoBaseline: s.undoBaseline
              ? {
                  board: {
                    ...s.undoBaseline.board,
                    remaining: [...s.undoBaseline.board.remaining],
                  },
                  holder: s.undoBaseline.holder,
                  status: s.undoBaseline.status,
                }
              : null,
            status: s.status,
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
    undoBaseline: null,
    status: 'idle',
    selectedId: null,
    hint: null,
    hintPending: false,
    announcement: '',

    settings: DEFAULT_SETTINGS,
    inventory: DEFAULT_INVENTORY,
    profile: INITIAL_PROFILE,
    progression: INITIAL_PROGRESSION,
    boardsCompleted: 0,
    deviceUnlocked: false,
    unlocked: false,
    purchasePending: null,
    purchaseDisplayPrice: null,
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

      // Filling the holder pauses the attempt and offers a revive; it is not a
      // final loss yet. Only record the loss when the player declines that
      // revive by leaving or starting over. This keeps a revived board from
      // being counted once as a loss and again as a later win.
      if (
        before.screen === 'game_over' &&
        get().status === 'holder_full' &&
        (action.type === 'start_board' || action.type === 'leave_game_over')
      ) {
        finishBoard(false);
      }

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
      // A WebView can be recreated while its final Preferences write is still
      // resolving. Always read after the newest in-process snapshot is durable.
      await flushPersisted();
      const loaded = await loadPersisted();
      const saved = loaded.state;
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
        progression?: Progression;
        boardsCompleted?: number;
        deviceUnlocked?: boolean;
        unlocked?: boolean;
        inventory?: Partial<Inventory>;
      };

      // Older snapshots did not distinguish an account unlock from a StoreKit
      // unlock. In a configured release, never promote that ambiguous legacy
      // bit to a device entitlement while verification is unavailable.
      const cachedDeviceEntitlement =
        progress.deviceUnlocked ?? (!purchasesConfigured() && progress.unlocked === true);
      const storedBoardsCompleted = progress.boardsCompleted ?? progress.flow?.boardsCompleted ?? 0;
      const reconciledFlow = progress.flow
        ? { ...progress.flow, boardsCompleted: storedBoardsCompleted }
        : progress.flow;

      set({
        flow: initialFlowState(reconciledFlow),
        settings,
        profile: progress.profile ?? INITIAL_PROFILE,
        progression: progress.progression ?? INITIAL_PROGRESSION,
        boardsCompleted: storedBoardsCompleted,
        deviceUnlocked: cachedDeviceEntitlement,
        unlocked: cachedDeviceEntitlement,
        inventory: { ...DEFAULT_INVENTORY, ...(progress.inventory ?? {}) },
        accountStatus: appleSignInAvailable() ? 'signed_out' : 'unavailable',
        accountId: null,
      });

      // Restore a board if one exists. Otherwise pre-deal the first board so
      // Start is instant after onboarding; the flow still prevents it from
      // being shown or interacted with before the legal/tutorial gates.
      const resume = saved?.resume as
        | {
            board?: Omit<BoardState, 'remaining'> & { remaining: number[] };
            holder?: number[];
            tapHistory?: number[];
            undoBaseline?: {
              board?: Omit<BoardState, 'remaining'> & { remaining: number[] };
              holder?: number[];
              status?: Status;
            } | null;
            status?: Status;
            layoutId: LayoutId;
            seed: number;
            removed: [number, number][];
            taps?: number[];
            session: SessionStats;
          }
        | null
        | undefined;

      if (resume?.board && isPersistedBoard(resume.board, resume.holder ?? [])) {
        const board: BoardState = { ...resume.board, remaining: new Set(resume.board.remaining) };
        const restoredStatus = persistedStatus(board, resume.holder ?? []);
        const persistedBaseline = resume.undoBaseline;
        const baselineValid =
          persistedBaseline?.board &&
          isPersistedBoard(persistedBaseline.board, persistedBaseline.holder ?? []);
        const undoBaseline: UndoBaseline = baselineValid
          ? {
              board: {
                ...persistedBaseline.board!,
                remaining: new Set(persistedBaseline.board!.remaining),
              },
              holder: persistedBaseline.holder ?? [],
              status: persistedStatus(
                {
                  ...persistedBaseline.board!,
                  remaining: new Set(persistedBaseline.board!.remaining),
                },
                persistedBaseline.holder ?? [],
              ),
            }
          : { board, holder: resume.holder ?? [], status: restoredStatus };
        const currentFlow = get().flow;
        const canResumeBoard = currentFlow.screen === 'home';
        set({
          flow: canResumeBoard
            ? { ...currentFlow, screen: restoredStatus === 'playing' ? 'gameplay' : 'game_over' }
            : currentFlow,
          board,
          holder: resume.holder ?? [],
          // Older snapshots did not store an undo baseline. Their current board
          // is safe to resume, but replaying their old taps could resurrect
          // pre-shuffle tiles, so start a new undo segment at the saved state.
          tapHistory: baselineValid ? resume.tapHistory ?? [] : [],
          undoBaseline,
          status: restoredStatus,
          session: resume.session ?? freshSession(),
        });
      } else if (resume?.layoutId) {
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
            undoBaseline: {
              board: startSession(resume.layoutId, resume.seed).board,
              holder: [],
              status: 'playing',
            },
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
            undoBaseline: { board, holder: [], status: statusFor(board) },
            status: statusFor(board),
            session: resume.session ?? freshSession(),
          });
        }
      } else {
        get().start();
      }

      // Local play is now fully restored. Reveal it before any network-backed
      // entitlement or account request, so an offline launch never becomes an
      // eight-second blank screen.
      set({
        hydrated: true,
        announcement: loaded.recoveredFromCorruption
          ? 'Saved progress could not be restored. A fresh board is ready, and local play is still available.'
          : get().announcement,
      });

      const [currentDeviceEntitlement, account, product] = await Promise.all([
        purchases().isUnlocked(),
        restoreAccount(),
        purchases().product?.() ?? Promise.resolve(null),
      ]);
      // StoreKit is authoritative when it returns a result. A verifier outage
      // returns null and preserves the last verified device entitlement.
      const deviceUnlocked = purchasesConfigured()
        ? currentDeviceEntitlement ?? get().deviceUnlocked
        : get().deviceUnlocked;
      const remoteSettings = account?.settings?.settings;
      set((s) => ({
        settings: remoteSettings
          ? {
              ...s.settings,
              ...remoteSettings,
              theme: remoteSettings.theme === 'system' ? 'calm' : remoteSettings.theme,
            }
          : s.settings,
        deviceUnlocked,
        unlocked: deviceUnlocked || account?.unlock?.unlocked === true,
        purchaseDisplayPrice: product?.displayPrice ?? null,
        accountStatus: account ? 'signed_in' : appleSignInAvailable() ? 'signed_out' : 'unavailable',
        accountId: account?.session.accountId ?? null,
      }));
      persist();
    },

    start(layoutId) {
      const { profile } = get();
      const chosen = layoutId ?? chooseLayout(profile);
      const play = startSession(chosen, randomSeed());
      set({
        board: play.board,
        holder: play.holder,
        tapHistory: [],
        undoBaseline: { board: play.board, holder: play.holder, status: 'playing' },
        status: 'playing',
        selectedId: null,
        hint: null,
        session: freshSession(),
        announcement: `New board. ${play.board.remaining.size} tiles.`,
      });
      persist();
    },

    newBoard(layoutId) {
      // A fresh-board command is navigation plus state replacement. Keep it in
      // one store action so Settings cannot deal a board behind Home, and so
      // gameplay callers cannot accidentally remain on a result screen.
      const screen = get().flow.screen;
      if (screen === 'gameplay') get().dispatchFlow({ type: 'leave_board' });
      get().start(layoutId);
      get().dispatchFlow({ type: 'start_board' });
      set({ settingsOpen: false, paywallOpen: false });
      persist();
    },

    tapTile(id) {
      const { board, holder, tapHistory, settings, status } = get();
      if (!board || !board.remaining.has(id) || status !== 'playing') return;

      const play = playSessionFromState(board, holder, status);
      const next = tapPlayTile(play, id);
      if (next === play) {
        playSound('blocked', settings.sounds);
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
        playSound('match', settings.sounds);
        void track('pair_cleared', {
          layout: board.layoutId,
          seed: board.seed,
          holderCount: next.holder.length,
          tilesRemaining: next.board.remaining.size,
          cleared: next.board.removed.length * 2,
        });
      } else {
        playSound(next.holder.length === 3 ? 'holder-warning' : 'tile', settings.sounds);
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
        playSound('win', settings.sounds);
        finishBoard(true);
        get().dispatchFlow({ type: 'board_won' });
      } else if (nextStatus === 'holder_full') {
        playSound('holder-full', settings.sounds);
        get().dispatchFlow({ type: 'holder_full' });
      }
      persist();
    },

    clearSelection() {
      set({ selectedId: null });
    },

    dismissAnnouncement() {
      set({ announcement: '' });
    },

    async requestHint() {
      const { board, holder, status, unlocked, hintPending, settings, inventory } = get();
      if (!board || hintPending) return;

      if (inventory.hint <= 0) {
        set({ announcement: 'No Hints available. Collect a daily reward or choose a rewarded Hint when that service is available.' });
        return;
      }

      void track('hint_tapped', { layout: board.layoutId, seed: board.seed });
      set({ hintPending: true });
      const safePair = holderHintPair(playSessionFromState(board, holder, status));
      if (!safePair) {
        set({ hint: null, hintPending: false, announcement: 'No safe pair is available. Try Shuffle.' });
        return;
      }

      const coached = await getHint(board, { allowModelPhrasing: unlocked });
      const safeIds = new Set(safePair.map((tile) => tile.id));
      const coachedIsSafe = coached?.pair.every((tile) => safeIds.has(tile.id)) === true;
      const heldTile = safePair.find((tile) => holder.includes(tile.id));
      const boardTile = safePair.find((tile) => board.remaining.has(tile.id));
      const hint: Hint = coachedIsSafe
        ? coached!
        : {
            pair: safePair,
            text: heldTile
              ? `Take ${faceName(boardTile!.face)}. It matches the tile already in your holder.`
              : `These two ${faceName(safePair[0].face)} tiles are both free and safe to take.`,
            summary: heldTile
              ? `Take ${faceName(boardTile!.face)}. It matches the tile already in your holder.`
              : `Take the two ${faceName(safePair[0].face)} tiles.`,
            tier: 'offline',
          };
      if (hint) playSound('hint', settings.sounds);
      if (hint) void track('hint_shown', { layout: board.layoutId, seed: board.seed });
      set((s) => ({
        hint,
        hintPending: false,
        inventory: { ...s.inventory, hint: Math.max(0, s.inventory.hint - 1) },
        session: { ...s.session, hintsUsed: s.session.hintsUsed + 1 },
        announcement: hint?.summary ?? 'No pairs available.',
      }));
      persist();
    },

    dismissHint() {
      set({ hint: null });
    },

    undo() {
      const { board, tapHistory, undoBaseline, settings } = get();
      if (!board || !undoBaseline || tapHistory.length === 0) return;
      const taps = tapHistory.slice(0, -1);
      const next = replayFromBaseline(undoBaseline, taps);
      if (!next) return;
      playSound('undo', settings.sounds);
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
      const { board, holder, status, settings, inventory } = get();
      if (!board) return;
      if (inventory.shuffle <= 0) {
        set({ announcement: 'No Shuffles available. Collect a daily reward or get a Shuffle pack when StoreKit is available.' });
        return;
      }
      void track('shuffle_tapped', { layout: board.layoutId, seed: board.seed });
      const play = playSessionFromState(board, holder, status);
      const next = shufflePlaySession(play, randomSeed());
      if (next === play) return;
      playSound('shuffle', settings.sounds);
      void track('shuffle_granted', { layout: board.layoutId, seed: board.seed });
      set({
        board: next.board,
        holder: next.holder,
        tapHistory: [],
        undoBaseline: { board: next.board, holder: next.holder, status: statusForPlaySession(next) },
        status: statusForPlaySession(next),
        selectedId: null,
        hint: null,
        inventory: { ...inventory, shuffle: Math.max(0, inventory.shuffle - 1) },
        announcement: 'Tiles reshuffled.',
        session: { ...get().session, shufflesUsed: (get().session.shufflesUsed ?? 0) + 1 },
      });
      persist();
    },

    useRevive() {
      const { board, holder, status, inventory, settings } = get();
      if (!board || status !== 'holder_full') return;
      if (inventory.revive <= 0) {
        set({ announcement: 'No Revives available. Restart or return home.' });
        return;
      }
      const revived = revivePlaySession(playSessionFromState(board, holder, status));
      if (revived.status !== 'playing') return;
      playSound('shuffle', settings.sounds);
      set((state) => ({
        board: revived.board,
        holder: revived.holder,
        status: 'playing',
        tapHistory: [],
        undoBaseline: { board: revived.board, holder: [], status: 'playing' },
        inventory: { ...state.inventory, revive: state.inventory.revive - 1 },
        session: { ...state.session, revivesUsed: state.session.revivesUsed + 1 },
        announcement: 'Revived. Held tiles returned safely to the board.',
      }));
      get().dispatchFlow({ type: 'revive' });
      persist();
    },

    updateSettings(patch) {
      if (patch.theme || patch.tileStyle) clearFaceCache();
      for (const key of Object.keys(patch)) void track('setting_changed', { settingKey: key });
      set((s) => ({ settings: { ...s.settings, ...patch } }));
      persist();
      void syncAccountSettings(syncedSettings(get().settings)).catch(() => {
        // Local settings remain authoritative while offline; the next change
        // or sign-in retries without interrupting play.
      });
    },

    grantInventory(kind, quantity) {
      if (!['hint', 'shuffle', 'revive'].includes(kind) || !Number.isSafeInteger(quantity) || quantity <= 0) return;
      set((state) => ({ inventory: { ...state.inventory, [kind]: state.inventory[kind as keyof Inventory] + quantity } }));
      persist();
    },

    openSettings(open) {
      if (open) void track('settings_opened');
      set({ settingsOpen: open });
    },

    closePaywall() {
      set({ paywallOpen: false });
    },

    async buy() {
      if (get().purchasePending) return;
      set({ purchasePending: 'buying', announcement: 'Contacting Apple…' });
      try {
        const result = await purchases().purchase();
        if (result.status === 'purchased' || result.status === 'restored') {
          set({ deviceUnlocked: true, unlocked: true, paywallOpen: false, announcement: 'Unlocked. Thank you.' });
          persist();
        } else if (result.status !== 'cancelled') {
          set({ announcement: result.message ?? 'Purchase could not be completed.' });
        }
      } finally {
        set({ purchasePending: null });
      }
    },

    async restore() {
      if (get().purchasePending) return;
      set({ purchasePending: 'restoring', announcement: 'Checking with Apple…' });
      try {
        const result = await purchases().restore();
        if (result.status === 'restored' || result.status === 'purchased') {
          set({ deviceUnlocked: true, unlocked: true, paywallOpen: false, announcement: 'Purchase restored.' });
          persist();
        } else {
          set({ announcement: result.message ?? 'No purchase to restore.' });
        }
      } finally {
        set({ purchasePending: null });
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
        // Revalidate after saveSession: verifyAndFinish now sends the new bearer,
        // associating a purchase made while signed out with this verified
        // account. This is also the recovery path for a new device.
        const currentDeviceEntitlement = await purchases().isUnlocked();
        set((s) => ({
          accountStatus: 'signed_in',
          accountId: account.session.accountId,
          accountError: null,
          deviceUnlocked: currentDeviceEntitlement ?? s.deviceUnlocked,
          unlocked: (currentDeviceEntitlement ?? s.deviceUnlocked) || account.unlock?.unlocked === true,
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
      set((s) => ({
        accountStatus: appleSignInAvailable() ? 'signed_out' : 'unavailable',
        accountId: null,
        accountError: null,
        unlocked: s.deviceUnlocked,
        announcement: 'Signed out. Your game remains on this device.',
      }));
      persist();
    },
  };

  /** Rolls the finished board into the skill profile and decides on the paywall. */
  function finishBoard(completed: boolean) {
    const { board, session, profile, progression, boardsCompleted, unlocked, purchaseDisplayPrice } = get();
    if (!board) return;

    const nextProfile = recordOutcome(profile, {
      layoutId: board.layoutId,
      completed,
      movesPlayed: session.movesPlayed,
      hintsUsed: session.hintsUsed,
      elapsedSeconds: (Date.now() - session.startedAt) / 1000,
    });
    const total = boardsCompleted + (completed ? 1 : 0);
    const nextProgression = recordBoard(progression, {
      layout: board.layoutId,
      won: completed,
      pairsCleared: board.removed.length,
      tilesTotal: board.tiles.length,
      hintsUsed: session.hintsUsed,
      revivesUsed: session.revivesUsed ?? 0,
      shufflesUsed: session.shufflesUsed ?? 0,
      elapsedSeconds: (Date.now() - session.startedAt) / 1000,
    });

    set({
      profile: nextProfile,
      progression: nextProgression,
      boardsCompleted: total,
      // Once, after the third finished board, and never for someone who has
      // already paid. Not before a board, not mid-board, not on a timer.
      paywallOpen:
        purchasesConfigured() &&
        purchaseDisplayPrice !== null &&
        !unlocked &&
        completed &&
        total === PAYWALL_AFTER_BOARDS,
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
