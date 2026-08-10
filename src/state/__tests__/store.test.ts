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

const { availableMoves, freeTiles } = await import('../../game/board');
const { createRng } = await import('../../game/rng');
const { MockPurchases, setPurchases } = await import('../../iap');
const { PAYWALL_AFTER_BOARDS, useGame, DEFAULT_SETTINGS } = await import('../store');

const initial = useGame.getState();

function reset() {
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
    status: 'idle',
    selectedId: null,
    hint: null,
    settings: DEFAULT_SETTINGS,
    boardsCompleted: 0,
    unlocked: false,
    paywallOpen: false,
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

  it('lands on a playable board with no login and no menu', async () => {
    await useGame.getState().hydrate();
    const { board, status } = useGame.getState();
    expect(board).not.toBeNull();
    expect(status).toBe('playing');
    expect(board!.remaining.size).toBeGreaterThan(0);
    expect(availableMoves(board!).length).toBeGreaterThan(0);
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

  it('treats a non-matching second tap as reselecting, not as an error', async () => {
    await useGame.getState().hydrate();
    const board = useGame.getState().board!;
    const [first, second] = availableMoves(board)[0];
    const mismatch = availableMoves(board)
      .flat()
      .find((t) => t.id !== first.id && t.id !== second.id && t.face.suit !== first.face.suit);

    useGame.getState().tapTile(first.id);
    useGame.getState().tapTile(mismatch!.id);
    expect(useGame.getState().selectedId).toBe(mismatch!.id);
    expect(useGame.getState().board!.remaining.size).toBe(board.remaining.size);
  });

  it('undoes a move', async () => {
    await useGame.getState().hydrate();
    const before = useGame.getState().board!.remaining.size;
    const [a, b] = availableMoves(useGame.getState().board!)[0];
    useGame.getState().tapTile(a.id);
    useGame.getState().tapTile(b.id);
    expect(useGame.getState().board!.remaining.size).toBe(before - 2);

    useGame.getState().undo();
    expect(useGame.getState().board!.remaining.size).toBe(before);
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
    expect(useGame.getState().paywallOpen).toBe(false);
  });

  it('reports honestly when there is nothing to restore', async () => {
    await useGame.getState().hydrate();
    await useGame.getState().restore();
    expect(useGame.getState().unlocked).toBe(false);
    expect(useGame.getState().announcement).toMatch(/no previous purchase|no purchase/i);
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

    // Simulate a cold start: same persisted blob, fresh store.
    useGame.setState({ ...initial, board: null, status: 'idle', hydrated: false });
    await useGame.getState().hydrate();

    const restored = useGame.getState().board!;
    expect(restored.seed).toBe(expected.seed);
    expect(restored.layoutId).toBe(expected.layoutId);
    expect(restored.remaining.size).toBe(remaining);
  });

  it('starts a fresh board when there is nothing saved', async () => {
    await useGame.getState().hydrate();
    expect(useGame.getState().board).not.toBeNull();
    expect(useGame.getState().board!.removed).toEqual([]);
  });

  it('keeps settings across a restart', async () => {
    await useGame.getState().hydrate();
    useGame.getState().updateSettings({ theme: 'high-contrast', fontScale: 1.45 });

    useGame.setState({ ...initial, board: null, hydrated: false, settings: DEFAULT_SETTINGS });
    await useGame.getState().hydrate();

    expect(useGame.getState().settings.theme).toBe('high-contrast');
    expect(useGame.getState().settings.fontScale).toBe(1.45);
  });
});
