/**
 * Session-flow tests.
 *
 * These cover the rules the *brief* cares about rather than the ones the game
 * cares about: one tap to a playable board, no login, and a paywall that shows
 * up exactly once, after the third completed board, and never before.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      store.delete(key);
    },
  },
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: async () => {} },
  ImpactStyle: { Light: 'LIGHT' },
}));

// The renderer touches the DOM; nothing under test needs it to do anything.
vi.mock('../../render/boardRenderer', () => ({
  render: () => undefined,
  clearFaceCache: () => undefined,
}));

const { availableMoves, freeTiles } = await import('../../../packages/core/src/game/board');
const { createRng } = await import('../../../packages/core/src/game/rng');
const { MockPurchases, setPurchases } = await import('../../iap');
const { flushPersisted } = await import('../persist');
const { PAYWALL_AFTER_BOARDS, useGame, DEFAULT_SETTINGS } = await import('../store');

const initial = useGame.getState();

async function reset() {
  await flushPersisted();
  store.clear();
  // New boards draw their seed from Math.random. Pin it so these tests are
  // reproducible: a failure here must be re-runnable, not a coin flip.
  const rng = createRng(0xc0ffee);
  vi.spyOn(Math, 'random').mockImplementation(() => rng.next());
  // The purchases provider is a module singleton, so an unlock bought in one
  // test would otherwise be owned by the next one.
  setPurchases(new MockPurchases());
  useGame.setState({
    ...initial,
    board: null,
    holder: [],
    tapHistory: [],
    undoBaseline: null,
    status: 'idle',
    selectedId: null,
    hint: null,
    settings: DEFAULT_SETTINGS,
    boardsCompleted: 0,
    deviceUnlocked: false,
    unlocked: false,
    paywallOpen: false,
    freeReviveAvailable: true,
    hydrated: false,
  });
}

/** Plays the current board to completion through the public store API. */
function playToCompletion(): { moves: number; shuffles: number } {
  let moves = 0;
  let shuffles = 0;

  for (let guard = 0; guard < 500; guard++) {
    const { board, status } = useGame.getState();
    if (!board || status === 'complete') break;

    const options = availableMoves(board);
    if (options.length === 0) {
      useGame.getState().shuffleBoard();
      shuffles++;
      continue;
    }

    // Take the pair from the highest layers — a competent player's instinct,
    // and the one most likely to clear the board.
    const best = options.reduce((a, b) => (b[0].z + b[1].z > a[0].z + a[1].z ? b : a));
    useGame.getState().tapTile(best[0].id);
    useGame.getState().tapTile(best[1].id);
    moves++;
  }

  return { moves, shuffles };
}

describe('session flow', () => {
  beforeEach(reset);

  it('starts behind the legal gate and follows the shared flow machine', async () => {
    await useGame.getState().hydrate();
    expect(useGame.getState().flow.screen).toBe('tos');

    useGame.getState().dispatchFlow({ type: 'accept_tos', at: '2026-08-10T00:00:00.000Z' });
    expect(useGame.getState().flow.screen).toBe('age_gate');

    useGame.getState().dispatchFlow({ type: 'answer_age_gate', passed: true });
    expect(useGame.getState().flow.screen).toBe('loading');
    useGame.getState().dispatchFlow({ type: 'loading_finished' });
    expect(useGame.getState().flow.screen).toBe('tutorial_a');
  });

  it('persists onboarding progress across a restart', async () => {
    await useGame.getState().hydrate();
    useGame.getState().dispatchFlow({ type: 'accept_tos', at: '2026-08-10T00:00:00.000Z' });
    useGame.getState().dispatchFlow({ type: 'answer_age_gate', passed: true });
    await Promise.resolve();

    useGame.setState({ ...initial, board: null, status: 'idle', hydrated: false });
    await useGame.getState().hydrate();
    expect(useGame.getState().flow.screen).toBe('tutorial_a');
  });

  it('lands on a playable board with no login and no menu', async () => {
    await useGame.getState().hydrate();
    const { board, status } = useGame.getState();
    expect(board).not.toBeNull();
    expect(status).toBe('playing');
    expect(board!.remaining.size).toBeGreaterThan(0);
    expect(availableMoves(board!).length).toBeGreaterThan(0);
    expect(useGame.getState().purchaseDisplayPrice).toBe('$4.99');
  });

  it('reveals the local game before entitlement verification finishes', async () => {
    let finishEntitlementCheck!: (value: boolean | null) => void;
    const entitlementCheck = new Promise<boolean | null>((resolve) => {
      finishEntitlementCheck = resolve;
    });
    setPurchases({
      isUnlocked: () => entitlementCheck,
      purchase: async () => ({ status: 'unavailable' as const }),
      restore: async () => ({ status: 'unavailable' as const }),
    });

    const hydration = useGame.getState().hydrate();
    await vi.waitFor(() => expect(useGame.getState().hydrated).toBe(true));

    expect(useGame.getState().hydrated).toBe(true);
    expect(useGame.getState().board).not.toBeNull();

    finishEntitlementCheck(false);
    await hydration;
  });

  it('opens the first board on the gentlest layout', async () => {
    await useGame.getState().hydrate();
    expect(useGame.getState().board!.layoutId).toBe('pyramid');
  });

  it('ignores a tap on a blocked tile instead of punishing it', async () => {
    await useGame.getState().hydrate();
    const board = useGame.getState().board!;
    // Free means "can slide out", not "has a partner on the board" — a free
    // tile with no current match is still a legal thing to select.
    const free = new Set(freeTiles(board).map((t) => t.id));
    const blocked = board.tiles.find((t) => !free.has(t.id));
    expect(blocked, 'no blocked tile on the opening board').toBeDefined();

    useGame.getState().tapTile(blocked!.id);
    expect(useGame.getState().selectedId).toBeNull();
    expect(useGame.getState().announcement).toMatch(/blocked/i);
  });

  it('moves unmatched free tiles into the four-slot holder', async () => {
    await useGame.getState().hydrate();
    const board = useGame.getState().board!;
    const [first, second] = availableMoves(board)[0];
    const mismatch = availableMoves(board)
      .flat()
      .find((t) => t.id !== first.id && t.id !== second.id && t.face.suit !== first.face.suit);

    useGame.getState().tapTile(first.id);
    useGame.getState().tapTile(mismatch!.id);
    expect(useGame.getState().holder).toEqual([first.id, mismatch!.id]);
    expect(useGame.getState().selectedId).toBeNull();
    expect(useGame.getState().board!.remaining.size).toBe(board.remaining.size - 2);
  });

  it('undoes a move', async () => {
    await useGame.getState().hydrate();
    const before = useGame.getState().board!.remaining.size;
    const [a, b] = availableMoves(useGame.getState().board!)[0];
    useGame.getState().tapTile(a.id);
    useGame.getState().tapTile(b.id);
    expect(useGame.getState().board!.remaining.size).toBe(before - 2);

    useGame.getState().undo();
    expect(useGame.getState().board!.remaining.size).toBe(before - 1);
    expect(useGame.getState().holder).toEqual([a.id]);

    useGame.getState().undo();
    expect(useGame.getState().board!.remaining.size).toBe(before);
    expect(useGame.getState().holder).toEqual([]);
  });

  it('undoes from the shuffled board without resurrecting cleared tiles', async () => {
    await useGame.getState().hydrate();
    const [a, b] = availableMoves(useGame.getState().board!)[0];
    useGame.getState().tapTile(a.id);
    useGame.getState().tapTile(b.id);
    useGame.getState().shuffleBoard();

    const baseline = useGame.getState().board!;
    const baselineIds = [...baseline.remaining].sort((x, y) => x - y);
    const tile = freeTiles(baseline)[0];
    useGame.getState().tapTile(tile.id);
    useGame.getState().undo();

    expect([...useGame.getState().board!.remaining].sort((x, y) => x - y)).toEqual(baselineIds);
    expect(useGame.getState().board!.tiles.map((entry) => entry.face)).toEqual(
      baseline.tiles.map((entry) => entry.face),
    );
    expect(useGame.getState().holder).toEqual([]);
  });

  it('only offers holder-aware hints that are safe with three occupied slots', async () => {
    const { startSession, tapTile, tappableTiles } = await import(
      '../../../packages/core/src/play/session'
    );
    const { matchGroup } = await import('../../../packages/core/src/game/tiles');
    let play = startSession('turtle', 0xc0ffee);
    while (play.holder.length < 3) {
      const heldGroups = new Set(
        play.holder.map((id) => matchGroup(play.board.tiles.find((tile) => tile.id === id)!.face)),
      );
      const candidate = tappableTiles(play).find((tile) => !heldGroups.has(matchGroup(tile.face)));
      expect(candidate).toBeDefined();
      play = tapTile(play, candidate!.id);
    }

    useGame.setState({
      board: play.board,
      holder: play.holder,
      status: 'playing',
      tapHistory: [],
      undoBaseline: { board: play.board, holder: play.holder, status: 'playing' },
    });
    await useGame.getState().requestHint();

    const hint = useGame.getState().hint;
    expect(hint).not.toBeNull();
    expect(hint!.pair.some((tile) => play.holder.includes(tile.id))).toBe(true);
    const suggestedBoardTile = hint!.pair.find((tile) => play.board.remaining.has(tile.id));
    expect(suggestedBoardTile).toBeDefined();
    useGame.getState().tapTile(suggestedBoardTile!.id);
    expect(useGame.getState().status).toBe('playing');
    expect(useGame.getState().holder).toHaveLength(2);
  });
});

describe('paywall timing', () => {
  beforeEach(reset);

  it('does not appear before or during the first three boards', async () => {
    await useGame.getState().hydrate();

    for (let boardNumber = 1; boardNumber < PAYWALL_AFTER_BOARDS; boardNumber++) {
      expect(useGame.getState().paywallOpen).toBe(false);
      playToCompletion();
      expect(useGame.getState().status).toBe('complete');
      expect(
        useGame.getState().paywallOpen,
        `paywall appeared after board ${boardNumber}`,
      ).toBe(false);
      useGame.getState().start();
    }
  });

  it('appears once, after the third completed board', async () => {
    await useGame.getState().hydrate();

    for (let i = 0; i < PAYWALL_AFTER_BOARDS; i++) {
      playToCompletion();
      if (i < PAYWALL_AFTER_BOARDS - 1) useGame.getState().start();
    }

    expect(useGame.getState().boardsCompleted).toBe(PAYWALL_AFTER_BOARDS);
    expect(useGame.getState().paywallOpen).toBe(true);
  });

  it('never appears for someone who already paid', async () => {
    await useGame.getState().hydrate();
    useGame.setState({ unlocked: true });

    for (let i = 0; i < PAYWALL_AFTER_BOARDS; i++) {
      playToCompletion();
      expect(useGame.getState().paywallOpen).toBe(false);
      useGame.getState().start();
    }
  });

  it('unlocks and closes on purchase', async () => {
    await useGame.getState().hydrate();
    useGame.setState({ paywallOpen: true });
    await useGame.getState().buy();
    expect(useGame.getState().unlocked).toBe(true);
    expect(useGame.getState().deviceUnlocked).toBe(true);
    expect(useGame.getState().paywallOpen).toBe(false);
  });

  it('reports honestly when there is nothing to restore', async () => {
    await useGame.getState().hydrate();
    await useGame.getState().restore();
    expect(useGame.getState().unlocked).toBe(false);
    expect(useGame.getState().announcement).toMatch(/no previous purchase|no purchase/i);
  });

  it('prevents duplicate StoreKit requests while a purchase is pending', async () => {
    let finishPurchase!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finishPurchase = resolve;
    });
    const purchase = vi.fn(async () => {
      await waiting;
      return { status: 'purchased' as const };
    });
    setPurchases({
      isUnlocked: async () => false,
      purchase,
      restore: async () => ({ status: 'unavailable' as const }),
    });
    await useGame.getState().hydrate();

    const first = useGame.getState().buy();
    const duplicate = useGame.getState().buy();
    expect(useGame.getState().purchasePending).toBe('buying');
    expect(purchase).toHaveBeenCalledTimes(1);

    finishPurchase();
    await Promise.all([first, duplicate]);
    expect(useGame.getState().purchasePending).toBeNull();
    expect(useGame.getState().unlocked).toBe(true);
  });

  it('does not let a cached unlock survive when StoreKit reports no entitlement', async () => {
    const bought = new MockPurchases();
    setPurchases(bought);
    await useGame.getState().hydrate();
    await useGame.getState().buy();
    expect(useGame.getState().unlocked).toBe(true);
    await Promise.resolve();

    // A fresh configured provider represents StoreKit after a refund or
    // revocation: no current entitlement, despite the old local cache.
    setPurchases(new MockPurchases());
    useGame.setState({ ...initial, board: null, status: 'idle', hydrated: false });
    await useGame.getState().hydrate();
    expect(useGame.getState().unlocked).toBe(false);
  });

  it('keeps a verified cached unlock when StoreKit verification is unavailable', async () => {
    const bought = new MockPurchases();
    setPurchases(bought);
    await useGame.getState().hydrate();
    await useGame.getState().buy();
    expect(useGame.getState().unlocked).toBe(true);
    await Promise.resolve();

    setPurchases({
      isUnlocked: async () => null,
      purchase: async () => ({ status: 'unavailable' as const }),
      restore: async () => ({ status: 'unavailable' as const }),
    });
    useGame.setState({ ...initial, board: null, status: 'idle', hydrated: false });
    await useGame.getState().hydrate();
    expect(useGame.getState().unlocked).toBe(true);
  });

  it('removes an account-only unlock when that account signs out', async () => {
    await useGame.getState().hydrate();
    useGame.setState({
      accountStatus: 'signed_in',
      accountId: 'account-a',
      deviceUnlocked: false,
      unlocked: true,
    });

    await useGame.getState().signOut();

    expect(useGame.getState().accountId).toBeNull();
    expect(useGame.getState().unlocked).toBe(false);
  });

  it('keeps a device StoreKit unlock when an account signs out', async () => {
    await useGame.getState().hydrate();
    useGame.setState({
      accountStatus: 'signed_in',
      accountId: 'account-a',
      deviceUnlocked: true,
      unlocked: true,
    });

    await useGame.getState().signOut();

    expect(useGame.getState().accountId).toBeNull();
    expect(useGame.getState().unlocked).toBe(true);
  });
});

describe('difficulty adapts silently', () => {
  beforeEach(reset);

  it('moves off the opening layout once boards are being cleared', async () => {
    await useGame.getState().hydrate();
    expect(useGame.getState().board!.layoutId).toBe('pyramid');

    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      seen.add(useGame.getState().board!.layoutId);
      playToCompletion();
      useGame.getState().closePaywall();
      useGame.getState().start();
    }

    expect(seen.size).toBeGreaterThan(1);
  });

  it('never announces a difficulty change', async () => {
    await useGame.getState().hydrate();
    const announcements: string[] = [];
    const unsubscribe = useGame.subscribe((s) => announcements.push(s.announcement));

    for (let i = 0; i < 4; i++) {
      playToCompletion();
      useGame.getState().closePaywall();
      useGame.getState().start();
    }
    unsubscribe();

    for (const text of announcements) {
      expect(text.toLowerCase()).not.toMatch(/difficult|harder|easier|level|challenge/);
    }
  });
});

describe('persistence', () => {
  beforeEach(reset);

  it('restores an in-progress board across a restart', async () => {
    await useGame.getState().hydrate();
    const [a, b] = availableMoves(useGame.getState().board!)[0];
    useGame.getState().tapTile(a.id);
    useGame.getState().tapTile(b.id);

    const expected = useGame.getState().board!;
    const remaining = expected.remaining.size;
    const taps = useGame.getState().tapHistory;

    // Simulate a cold start: same persisted blob, fresh store.
    useGame.setState({ ...initial, board: null, status: 'idle', hydrated: false });
    await useGame.getState().hydrate();

    const restored = useGame.getState().board!;
    expect(restored.seed).toBe(expected.seed);
    expect(restored.layoutId).toBe(expected.layoutId);
    expect(restored.remaining.size).toBe(remaining);
    expect(useGame.getState().tapHistory).toEqual(taps);
    expect(useGame.getState().holder).toEqual([]);
  });

  it('preserves removed tiles and the shuffled deal across a cold restart', async () => {
    await useGame.getState().hydrate();
    const [a, b] = availableMoves(useGame.getState().board!)[0];
    useGame.getState().tapTile(a.id);
    useGame.getState().tapTile(b.id);
    const remainingBeforeShuffle = useGame.getState().board!.remaining.size;

    useGame.getState().shuffleBoard();
    const shuffled = useGame.getState().board!;
    const faces = shuffled.tiles.map((tile) => tile.face);
    await Promise.resolve();

    useGame.setState({ ...initial, board: null, status: 'idle', hydrated: false });
    await useGame.getState().hydrate();

    expect(useGame.getState().board!.seed).toBe(shuffled.seed);
    expect(useGame.getState().board!.remaining.size).toBe(remainingBeforeShuffle);
    expect(useGame.getState().board!.tiles.map((tile) => tile.face)).toEqual(faces);
  });

  it('persists a single free revive and never silently replenishes it', async () => {
    await useGame.getState().hydrate();
    const board = useGame.getState().board!;
    const holder = [...board.remaining].slice(0, 4);
    const remaining = new Set(board.remaining);
    for (const id of holder) remaining.delete(id);
    useGame.setState({
      board: { ...board, remaining },
      holder,
      status: 'holder_full',
      flow: { ...useGame.getState().flow, screen: 'game_over' },
      freeReviveAvailable: true,
    });

    useGame.getState().revive();
    expect(useGame.getState().status).toBe('playing');
    expect(useGame.getState().holder).toEqual([]);
    expect(useGame.getState().freeReviveAvailable).toBe(false);
    for (const id of holder) expect(useGame.getState().board!.remaining.has(id)).toBe(true);
    await Promise.resolve();

    useGame.setState({ ...initial, board: null, status: 'idle', hydrated: false });
    await useGame.getState().hydrate();
    expect(useGame.getState().freeReviveAvailable).toBe(false);
  });

  it('does not count a paused holder-full board before the revive decision', async () => {
    await useGame.getState().hydrate();
    const board = useGame.getState().board!;
    const holder = [...board.remaining].slice(0, 4);
    const remaining = new Set(board.remaining);
    for (const id of holder) remaining.delete(id);
    useGame.setState({
      board: { ...board, remaining },
      holder,
      status: 'holder_full',
      flow: { ...useGame.getState().flow, screen: 'game_over' },
      freeReviveAvailable: true,
    });

    expect(useGame.getState().progression.boardsPlayed).toBe(0);
    useGame.getState().revive();
    expect(useGame.getState().progression.boardsPlayed).toBe(0);
  });

  it('records one loss when a holder-full board is abandoned', async () => {
    await useGame.getState().hydrate();
    const board = useGame.getState().board!;
    useGame.setState({
      status: 'holder_full',
      flow: { ...useGame.getState().flow, screen: 'game_over' },
      board,
    });

    useGame.getState().dispatchFlow({ type: 'leave_game_over' });
    expect(useGame.getState().progression.boardsPlayed).toBe(1);
    expect(useGame.getState().progression.boardsWon).toBe(0);

    // The transition is no longer valid from Home, so repeat taps cannot
    // duplicate the recorded outcome.
    useGame.getState().dispatchFlow({ type: 'leave_game_over' });
    expect(useGame.getState().progression.boardsPlayed).toBe(1);
  });

  it('records one loss before replacing a holder-full board', async () => {
    await useGame.getState().hydrate();
    useGame.setState({
      status: 'holder_full',
      flow: { ...useGame.getState().flow, screen: 'game_over' },
    });

    useGame.getState().dispatchFlow({ type: 'start_board' });
    expect(useGame.getState().progression.boardsPlayed).toBe(1);
    expect(useGame.getState().progression.boardsWon).toBe(0);
    expect(useGame.getState().status).toBe('playing');
  });

  it('returns an onboarded player directly to an active saved board', async () => {
    await useGame.getState().hydrate();
    useGame.getState().dispatchFlow({ type: 'accept_tos', at: '2026-08-10T00:00:00.000Z' });
    useGame.getState().dispatchFlow({ type: 'answer_age_gate', passed: true });
    useGame.getState().dispatchFlow({ type: 'loading_finished' });
    useGame.getState().dispatchFlow({ type: 'skip_tutorial' });
    useGame.getState().dispatchFlow({ type: 'start_board' });

    const free = freeTiles(useGame.getState().board!)[0];
    useGame.getState().tapTile(free.id);
    expect(useGame.getState().holder).toHaveLength(1);

    useGame.setState({
      ...initial,
      board: null,
      holder: [],
      tapHistory: [],
      status: 'idle',
      hydrated: false,
    });
    await useGame.getState().hydrate();

    expect(useGame.getState().flow.screen).toBe('gameplay');
    expect(useGame.getState().holder).toEqual([free.id]);
  });

  it('keeps the same active board when Back and Level 1 are used to pause and resume', async () => {
    await useGame.getState().hydrate();
    useGame.getState().dispatchFlow({ type: 'accept_tos', at: '2026-08-10T00:00:00.000Z' });
    useGame.getState().dispatchFlow({ type: 'answer_age_gate', passed: true });
    useGame.getState().dispatchFlow({ type: 'loading_finished' });
    useGame.getState().dispatchFlow({ type: 'skip_tutorial' });
    useGame.getState().dispatchFlow({ type: 'start_board' });

    const free = freeTiles(useGame.getState().board!)[0];
    useGame.getState().tapTile(free.id);
    const seed = useGame.getState().board!.seed;

    useGame.getState().dispatchFlow({ type: 'leave_board' });
    expect(useGame.getState().flow.screen).toBe('home');
    useGame.getState().dispatchFlow({ type: 'start_board' });

    expect(useGame.getState().flow.screen).toBe('gameplay');
    expect(useGame.getState().board!.seed).toBe(seed);
    expect(useGame.getState().holder).toEqual([free.id]);
  });

  it('opens a fresh playable board when New board is chosen from Home settings', async () => {
    await useGame.getState().hydrate();
    useGame.setState({
      flow: {
        screen: 'home',
        ageBlocked: false,
        progress: {
          tosAcceptedAt: '2026-08-10T00:00:00.000Z',
          agePassed: true,
          tutorialCompleted: 'tutorial_c',
          tutorialSkipped: false,
          boardsCompleted: 0,
        },
      },
      settingsOpen: true,
    });
    const previousSeed = useGame.getState().board!.seed;

    useGame.getState().newBoard();

    expect(useGame.getState().flow.screen).toBe('gameplay');
    expect(useGame.getState().settingsOpen).toBe(false);
    expect(useGame.getState().status).toBe('playing');
    expect(useGame.getState().board!.seed).not.toBe(previousSeed);
  });

  it('replaces an active board and stays in gameplay when New board is chosen in-game', async () => {
    await useGame.getState().hydrate();
    useGame.setState({
      flow: {
        screen: 'gameplay',
        ageBlocked: false,
        progress: {
          tosAcceptedAt: '2026-08-10T00:00:00.000Z',
          agePassed: true,
          tutorialCompleted: 'tutorial_c',
          tutorialSkipped: false,
          boardsCompleted: 0,
        },
      },
      settingsOpen: true,
    });
    const tile = freeTiles(useGame.getState().board!)[0];
    useGame.getState().tapTile(tile.id);
    const previousSeed = useGame.getState().board!.seed;

    useGame.getState().newBoard();

    expect(useGame.getState().flow.screen).toBe('gameplay');
    expect(useGame.getState().settingsOpen).toBe(false);
    expect(useGame.getState().board!.seed).not.toBe(previousSeed);
    expect(useGame.getState().holder).toEqual([]);
    expect(useGame.getState().tapHistory).toEqual([]);
  });

  it('starts a fresh board when there is nothing saved', async () => {
    await useGame.getState().hydrate();
    expect(useGame.getState().board).not.toBeNull();
    expect(useGame.getState().board!.removed).toEqual([]);
  });

  it('recovers corrupt saved progress with an honest announcement', async () => {
    store.set('mahjongbrain.state.v1', '{not-json');

    await useGame.getState().hydrate();

    expect(useGame.getState().hydrated).toBe(true);
    expect(useGame.getState().board).not.toBeNull();
    expect(useGame.getState().announcement).toMatch(/could not be restored/i);
    expect(useGame.getState().announcement).toMatch(/local play is still available/i);
    useGame.getState().dismissAnnouncement();
    expect(useGame.getState().announcement).toBe('');
  });

  it('recovers an unsupported saved-state version instead of trusting it', async () => {
    store.set('mahjongbrain.state.v1', JSON.stringify({ version: 99, settings: {}, progress: {}, resume: null }));

    await useGame.getState().hydrate();

    expect(useGame.getState().board).not.toBeNull();
    expect(useGame.getState().announcement).toMatch(/fresh board is ready/i);
  });

  it('keeps settings across a restart', async () => {
    await useGame.getState().hydrate();
    useGame.getState().updateSettings({ theme: 'high-contrast', fontScale: 1.45, sounds: false });

    useGame.setState({ ...initial, board: null, hydrated: false, settings: DEFAULT_SETTINGS });
    await useGame.getState().hydrate();

    expect(useGame.getState().settings.theme).toBe('high-contrast');
    expect(useGame.getState().settings.fontScale).toBe(1.45);
    expect(useGame.getState().settings.sounds).toBe(false);
  });

  it('records a win once and relaunches on the same result without double counting', async () => {
    await useGame.getState().hydrate();
    useGame.getState().dispatchFlow({ type: 'accept_tos', at: '2026-08-10T00:00:00.000Z' });
    useGame.getState().dispatchFlow({ type: 'answer_age_gate', passed: true });
    useGame.getState().dispatchFlow({ type: 'loading_finished' });
    useGame.getState().dispatchFlow({ type: 'skip_tutorial' });
    useGame.getState().dispatchFlow({ type: 'start_board' });

    playToCompletion();
    expect(useGame.getState().flow.screen).toBe('game_over');
    expect(useGame.getState().boardsCompleted).toBe(1);
    expect(useGame.getState().flow.progress.boardsCompleted).toBe(1);
    expect(useGame.getState().progression.boardsPlayed).toBe(1);
    expect(useGame.getState().progression.boardsWon).toBe(1);
    expect(useGame.getState().progression.xp).toBeGreaterThan(0);
    await Promise.resolve();

    useGame.setState({ ...initial, board: null, status: 'idle', hydrated: false });
    await useGame.getState().hydrate();

    expect(useGame.getState().flow.screen).toBe('game_over');
    expect(useGame.getState().boardsCompleted).toBe(1);
    expect(useGame.getState().flow.progress.boardsCompleted).toBe(1);
    expect(useGame.getState().progression.boardsPlayed).toBe(1);
    expect(useGame.getState().progression.boardsWon).toBe(1);
  });
});
