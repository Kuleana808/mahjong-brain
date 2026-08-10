/**
 * Contract tests.
 *
 * Two jobs. First, the ordinary one: the shapes are what `docs/api-contracts.md`
 * says they are. Second, and more important, the doctrine is enforced in code
 * rather than in a comment — an unconfigured server must never hand out an
 * unlock, analytics without consent must never be stored, and the difficulty
 * endpoints must never say anything a player could be shown.
 */

import { describe, expect, it, vi } from 'vitest';

import { availableMoves } from '../../game/board';
import { deal } from '../../game/deal';
import { LAYOUT_IDS } from '../../game/layouts';
import { authenticateWithApple } from '../handlers/auth';
import { recordSessionAnalytics } from '../handlers/analytics';
import { logPlayPattern, nextBoard } from '../handlers/difficulty';
import { generateBoard, validateMove } from '../handlers/game';
import { generateHint } from '../handlers/hints';
import { unlockStatus, validateReceipt } from '../handlers/purchases';
import { getSettings, patchSettings, DEFAULT_SYNCED_SETTINGS } from '../handlers/settings';
import { CONTRACT_REGISTRY } from '../index';
import type { Ports, StorePort, UnlockRecord } from '../ports';
import type { SyncedSettings } from '../types';

const NOW = '2026-08-09T12:00:00.000Z';
const fixed: Ports = { now: () => NOW, randomSeed: () => 4242 };

// --- envelope --------------------------------------------------------------

describe('the envelope', () => {
  it('is present on every response, success or not', () => {
    const good = generateBoard({ layout: 'turtle' }, fixed);
    const bad = generateBoard({ layout: 'not-a-layout' as never }, fixed);

    for (const envelope of [good, bad]) {
      expect(envelope.contract).toBeTruthy();
      expect(envelope.version).toBe('1');
      expect(envelope.generated_at).toBe(NOW);
      expect(envelope).toHaveProperty('state');
      expect(envelope).toHaveProperty('fallback_reason');
      expect(envelope).toHaveProperty('data');
      expect(envelope).toHaveProperty('error');
    }
    expect(good.error).toBeNull();
    expect(bad.data).toBeNull();
    expect(bad.error?.code).toBe('unknown_layout');
  });

  it('names a real contract id on every registry entry', () => {
    for (const entry of CONTRACT_REGISTRY) {
      expect(entry.id).toMatch(/^(game|api)\//);
      expect(entry.path.startsWith('/api/')).toBe(true);
    }
    expect(CONTRACT_REGISTRY).toHaveLength(12);
  });
});

// --- 1. board generate -----------------------------------------------------

describe('game/board/generate', () => {
  it.each(LAYOUT_IDS)('%s: returns a solvable board with an opening move', (layout) => {
    const { data } = generateBoard({ layout }, fixed);
    expect(data!.solvable).toBe(true);
    expect(data!.tileCount).toBe(144);
    expect(data!.openingMoves).toBeGreaterThan(0);
    expect(data!.seed).toBe(4242);
  });

  it('omits tiles unless asked, since the seed already carries them', () => {
    expect(generateBoard({ layout: 'turtle' }, fixed).data!.tiles).toBeNull();
    expect(generateBoard({ layout: 'turtle', includeTiles: true }, fixed).data!.tiles).toHaveLength(144);
  });

  it('is reproducible from the seed alone, which is the whole design', () => {
    const first = generateBoard({ layout: 'dragon', seed: 99, includeTiles: true }, fixed);
    const second = generateBoard({ layout: 'dragon', seed: 99, includeTiles: true }, fixed);
    expect(second.data!.tiles).toEqual(first.data!.tiles);
  });

  it('rejects a non-integer seed rather than coercing it', () => {
    const { error } = generateBoard({ layout: 'turtle', seed: 1.5 }, fixed);
    expect(error?.code).toBe('invalid_request');
    expect(error?.field).toBe('seed');
  });
});

// --- 2. validate-move ------------------------------------------------------

describe('game/board/validate-move', () => {
  const seed = 7;
  const board = deal('pyramid', seed);
  const legal = availableMoves(board)[0];

  it('accepts a legal opening move', () => {
    const { data } = validateMove(
      { layout: 'pyramid', seed, removed: [], move: [legal[0].id, legal[1].id] },
      fixed,
    );
    expect(data!.valid).toBe(true);
    expect(data!.reason).toBe('ok');
    expect(data!.tilesRemaining).toBe(142);
  });

  it('replays history to reach the current position', () => {
    const after = availableMoves(
      board.tiles.length ? { ...board, remaining: new Set([...board.remaining].filter((id) => id !== legal[0].id && id !== legal[1].id)) } : board,
    )[0];
    const { data } = validateMove(
      {
        layout: 'pyramid',
        seed,
        removed: [[legal[0].id, legal[1].id]],
        move: [after[0].id, after[1].id],
      },
      fixed,
    );
    expect(data!.valid).toBe(true);
    expect(data!.tilesRemaining).toBe(140);
  });

  it('catches a history that could not have happened', () => {
    const { data } = validateMove(
      { layout: 'pyramid', seed, removed: [[0, 1]], move: [legal[0].id, legal[1].id] },
      fixed,
    );
    // Tiles 0 and 1 are adjacent base-layer tiles; that pair is not takeable.
    expect(data!.valid).toBe(false);
    expect(data!.reason).toBe('replay_diverged');
  });

  it('names why a move was refused', () => {
    const same = validateMove(
      { layout: 'pyramid', seed, removed: [], move: [legal[0].id, legal[0].id] },
      fixed,
    );
    expect(same.data!.reason).toBe('same_tile');

    const mismatched = board.tiles.find(
      (t) => t.id !== legal[0].id && t.face.suit !== legal[0].face.suit,
    )!;
    const wrong = validateMove(
      { layout: 'pyramid', seed, removed: [], move: [legal[0].id, mismatched.id] },
      fixed,
    );
    expect(wrong.data!.valid).toBe(false);
    expect(['faces_do_not_match', 'second_tile_blocked']).toContain(wrong.data!.reason);
  });
});

// --- 5. hints --------------------------------------------------------------

describe('api/hints/generate', () => {
  it('returns a legal pair and teaching text', async () => {
    const { data } = await generateHint({ layout: 'turtle', seed: 3, removed: [] }, fixed);
    expect(data!.pair).toHaveLength(2);
    expect(data!.text.length).toBeGreaterThan(40);
    expect(data!.summary.length).toBeGreaterThan(10);
    expect(data!.tier).toBe('offline');

    const check = validateMove(
      { layout: 'turtle', seed: 3, removed: [], move: data!.pair as [number, number] },
      fixed,
    );
    expect(check.data!.valid).toBe(true);
  });

  it('never leaks coordinates into the coaching text', async () => {
    const { data } = await generateHint({ layout: 'dragon', seed: 12, removed: [] }, fixed);
    expect(data!.text).not.toMatch(/\d+\s*,\s*\d+/);
  });

  it('says so in fallback_reason when model phrasing was wanted but unavailable', async () => {
    const envelope = await generateHint(
      { layout: 'turtle', seed: 3, removed: [], allowModelPhrasing: true },
      fixed,
    );
    // No Ollama in the test environment, so this must degrade — and say so.
    if (envelope.data?.tier === 'offline') {
      expect(envelope.fallback_reason).toMatch(/ollama/i);
      expect(envelope.fallback_reason).toMatch(/unchanged/i);
    }
  });

  it('does not degrade silently when phrasing was not requested', async () => {
    const envelope = await generateHint({ layout: 'turtle', seed: 3, removed: [] }, fixed);
    expect(envelope.fallback_reason).toBeNull();
  });
});

// --- 6 & 7. difficulty -----------------------------------------------------

describe('play-pattern and next-board', () => {
  it('folds a finished board into the profile', () => {
    const { data } = logPlayPattern(
      {
        layout: 'pyramid',
        completed: true,
        movesPlayed: 72,
        hintsUsed: 0,
        elapsedSeconds: 300,
      },
      fixed,
    );
    expect(data!.accepted).toBe(true);
    expect(data!.profile.boardsCompleted).toBe(1);
    expect(data!.ignoredReason).toBeNull();
  });

  it('excludes a board that ended too early to mean anything', () => {
    const { data } = logPlayPattern(
      { layout: 'pyramid', completed: false, movesPlayed: 2, hintsUsed: 0, elapsedSeconds: 400 },
      fixed,
    );
    expect(data!.profile.secondsPerMove).toBeNull();
    expect(data!.ignoredReason).toMatch(/before it could say anything/i);
  });

  it('opens on the gentlest layout with no history', () => {
    expect(nextBoard({}, fixed).data!.layout).toBe('pyramid');
  });

  it('climbs for a fast, hint-free player', () => {
    let profile = logPlayPattern(
      { layout: 'pyramid', completed: true, movesPlayed: 72, hintsUsed: 0, elapsedSeconds: 72 },
      fixed,
    ).data!.profile;
    for (let i = 0; i < 8; i++) {
      profile = logPlayPattern(
        {
          layout: nextBoard({ profile }, fixed).data!.layout,
          completed: true,
          movesPlayed: 72,
          hintsUsed: 0,
          elapsedSeconds: 72,
          profile,
        },
        fixed,
      ).data!.profile;
    }
    expect(nextBoard({ profile }, fixed).data!.layout).toBe('dragon');
  });

  it('never returns wording a player could be shown', () => {
    // Difficulty adaptation is silent. `rationale` is a debug field and must
    // read as one — if it ever sounds like player-facing copy, someone will
    // render it.
    // Word boundaries matter — "layout" contains "you".
    const forbidden = /\b(you|your|congratulations|well done|too easy|too hard|difficulty)\b/i;
    expect(nextBoard({}, fixed).data!.rationale).not.toMatch(forbidden);

    const experienced = logPlayPattern(
      { layout: 'turtle', completed: true, movesPlayed: 72, hintsUsed: 4, elapsedSeconds: 300 },
      fixed,
    ).data!.profile;
    expect(nextBoard({ profile: experienced }, fixed).data!.rationale).not.toMatch(forbidden);
  });
});

// --- 3, 4, 8, 9, 10: the ones that need infrastructure ---------------------

describe('unconfigured endpoints fail honestly', () => {
  it('auth reports what is missing instead of minting a session', async () => {
    const envelope = await authenticateWithApple({ identityToken: 'a.b.c' }, fixed);
    expect(envelope.data).toBeNull();
    expect(envelope.state).toBe('source_available');
    expect(envelope.error?.code).toBe('not_configured');
    expect(envelope.fallback_reason).toMatch(/APPLE_BUNDLE_ID/);
  });

  it('auth still validates the request shape before anything else', async () => {
    const envelope = await authenticateWithApple({ identityToken: 'nope' }, fixed);
    expect(envelope.error?.code).toBe('invalid_request');
  });

  it('settings refuses rather than guessing at a signed-out player', async () => {
    const envelope = await getSettings(null, fixed);
    expect(envelope.data).toBeNull();
    expect(envelope.error?.code).toBe('not_configured');
  });
});

describe('purchases fail closed', () => {
  it('an unconfigured verifier never grants an unlock', async () => {
    const envelope = await validateReceipt({ signedTransaction: 'a.b.c' }, fixed);
    expect(envelope.data).toBeNull();
    expect(envelope.error?.code).toBe('not_configured');
    // The important assertion: nothing anywhere in this response says unlocked.
    expect(JSON.stringify(envelope)).not.toMatch(/"unlocked":true/);
  });

  it('distinguishes "not deployed" from "bad transaction" in the state', async () => {
    // Codex reads `state` to know whether an endpoint is worth calling. A
    // working verifier rejecting a bad token must not look like an unbuilt
    // endpoint, and an unbuilt endpoint must not look like a working one.
    const unconfigured = await validateReceipt({ signedTransaction: 'a.b.c' }, fixed);
    expect(unconfigured.state).toBe('source_available');
    expect(unconfigured.error?.code).toBe('not_configured');

    const configured = await validateReceipt({ signedTransaction: 'a.b.c' }, {
      ...fixed,
      store: stubStore(),
      storekit: {
        verifySignedTransaction: async () => {
          throw new Error('nope');
        },
      },
    });
    expect(configured.state).toBe('configured');
    expect(configured.error?.code).toBe('unverified_transaction');
  });

  it('a failed verification returns unlocked false, not an unlock', async () => {
    const ports: Ports = {
      ...fixed,
      storekit: {
        verifySignedTransaction: async () => {
          throw new Error('signature does not match');
        },
      },
      store: stubStore(),
    };
    const envelope = await validateReceipt({ signedTransaction: 'a.b.c' }, ports);
    expect(envelope.data).toBeNull();
    expect(envelope.error?.code).toBe('unverified_transaction');
    expect(envelope.fallback_reason).toMatch(/signature/);
  });

  it('grants the unlock only on a verified transaction', async () => {
    const ports: Ports = {
      ...fixed,
      storekit: {
        verifySignedTransaction: async () => ({
          productId: 'com.mahjongbrain.game.removeads',
          originalTransactionId: '2000000000000001',
          purchasedAt: NOW,
          environment: 'sandbox',
          revoked: false,
        }),
      },
      store: stubStore(),
    };
    const envelope = await validateReceipt({ signedTransaction: 'a.b.c' }, ports);
    expect(envelope.data!.unlocked).toBe(true);
    expect(envelope.state).toBe('configured');
  });

  it('honours a revocation — a refund takes the unlock back', async () => {
    const ports: Ports = {
      ...fixed,
      storekit: {
        verifySignedTransaction: async () => ({
          productId: 'com.mahjongbrain.game.removeads',
          originalTransactionId: '2000000000000001',
          purchasedAt: NOW,
          environment: 'production',
          revoked: true,
        }),
      },
      store: stubStore(),
    };
    const envelope = await validateReceipt({ signedTransaction: 'a.b.c' }, ports);
    expect(envelope.data!.unlocked).toBe(false);
    expect(envelope.fallback_reason).toMatch(/revoked/i);
  });

  it('unlock-status has no way to express a client claim', async () => {
    const envelope = await unlockStatus(null, fixed);
    expect(envelope.data!.unlocked).toBe(false);
    expect(envelope.data!.source).toBe('none');
    expect(envelope.fallback_reason).toMatch(/StoreKit entitlement remains authoritative/);
  });
});

describe('analytics is opt-in', () => {
  it('discards a request without consent, without touching storage', async () => {
    const store = stubStore();
    const spy = vi.spyOn(store, 'recordSession');
    const envelope = await recordSessionAnalytics(
      {
        consent: false,
        boardsStarted: 5,
        boardsCompleted: 3,
        hintsUsed: 2,
        totalSeconds: 900,
        appVersion: '0.1.0',
        anonymousSessionId: 'abcdefgh1234',
      },
      { ...fixed, store },
    );
    expect(envelope.data!.stored).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('stores only allow-listed fields when consent is given', async () => {
    const store = stubStore();
    const rows: Record<string, unknown>[] = [];
    store.recordSession = async (row) => {
      rows.push(row);
    };

    await recordSessionAnalytics(
      {
        consent: true,
        boardsStarted: 5,
        boardsCompleted: 3,
        hintsUsed: 2,
        totalSeconds: 900,
        appVersion: '0.1.0',
        anonymousSessionId: 'abcdefgh1234',
        // Something that must never reach storage, even if a caller sends it.
        appleUserId: 'ffffffff.aaaa.bbbb',
      } as never,
      { ...fixed, store },
    );

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        'anonymousSessionId',
        'appVersion',
        'boardsCompleted',
        'boardsStarted',
        'hintsUsed',
        'recorded_at',
        'totalSeconds',
      ].sort(),
    );
    expect(JSON.stringify(rows[0])).not.toMatch(/ffffffff/);
  });
});

// --- settings, with infrastructure present ---------------------------------

describe('settings sync', () => {
  it('returns defaults for an account that has never synced', async () => {
    const ports = withAccount();
    const envelope = await getSettings('token', ports);
    expect(envelope.data!.settings).toEqual(DEFAULT_SYNCED_SETTINGS);
    expect(envelope.data!.revision).toBe(0);
  });

  it('writes a patch and bumps the revision', async () => {
    const ports = withAccount();
    const written = await patchSettings('token', { fontScale: 1.45 }, ports);
    expect(written.data!.settings.fontScale).toBe(1.45);
    expect(written.data!.revision).toBe(1);
    expect((await getSettings('token', ports)).data!.settings.fontScale).toBe(1.45);
  });

  it('reports configured, not source_available, for a signed-out caller', async () => {
    const ports = withAccount();
    const envelope = await getSettings(null, ports);
    expect(envelope.state).toBe('configured');
    expect(envelope.error?.code).toBe('unauthenticated');
  });

  it('refuses a value outside the contract instead of coercing it', async () => {
    const ports = withAccount();
    const envelope = await patchSettings('token', { fontScale: 12 }, ports);
    expect(envelope.error?.code).toBe('invalid_request');
    expect(envelope.error?.field).toBe('fontScale');
  });

  it('does not clobber a newer write from another device', async () => {
    const ports = withAccount();
    await patchSettings('token', { theme: 'calm-dark' }, ports); // revision 1
    const stale = await patchSettings('token', { theme: 'high-contrast', ifRevision: 0 }, ports);

    expect(stale.fallback_reason).toMatch(/Stale revision/);
    expect(stale.data!.settings.theme).toBe('calm-dark');
    expect(stale.data!.revision).toBe(1);
  });
});

// --- helpers ---------------------------------------------------------------

function stubStore(): StorePort {
  let unlock: UnlockRecord | null = null;
  const settings = new Map<string, { settings: SyncedSettings; revision: number; updatedAt: string }>();

  return {
    async findAccountByAppleSubject() {
      return null;
    },
    async createAccount(subject) {
      return { accountId: 'acct_1', appleSubject: subject, createdAt: NOW };
    },
    async getSettings(accountId) {
      return settings.get(accountId) ?? null;
    },
    async putSettings(accountId, next, revision) {
      const row = { settings: next, revision, updatedAt: NOW };
      settings.set(accountId, row);
      return row;
    },
    async getUnlock() {
      return unlock;
    },
    async putUnlock(record) {
      unlock = record;
    },
    async recordSession() {},
    async recordEvents() {},
    async getDailyReward() {
      return null;
    },
    async putDailyReward() {},
  };
}

function withAccount(): Ports {
  return {
    ...fixed,
    store: stubStore(),
    session: {
      async issue() {
        return { token: 'token', expiresAt: NOW };
      },
      async verify(token) {
        return token === 'token' ? 'acct_1' : null;
      },
    },
  };
}
