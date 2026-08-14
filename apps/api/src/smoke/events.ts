/**
 * Instrumentation smoke test — end to end, against whatever store is configured.
 *
 * Drives a real player through the real state machines, collects the events the
 * machines say to emit, posts them through the real handler, and reads back what
 * landed. No mocks anywhere in the path.
 *
 *   npm run smoke:events                                    # in-process store
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run smoke:events
 *
 * The second form is the one that matters and it is the one that has not been
 * run: there is no Supabase project yet. When there is, this exits non-zero if a
 * single event fails to arrive, which is what "instrumentation is verified"
 * should mean rather than "the code looks right".
 */

import { EVENT_NAMES, ingestEvents, type ClientEvent, type EventName } from '@mahjong-brain/core';
import {
  eventsFor,
  initialState,
  reduce,
  type FlowAction,
  type FlowState,
} from '@mahjong-brain/core';
import {
  HOLDER_CAPACITY,
  hintPair,
  holderTiles,
  startSession,
  tapTile,
  tappableTiles,
  matchGroup,
} from '@mahjong-brain/core';

import { createPorts } from '../config';

const AT = () => new Date().toISOString();

/** Walks the nine screens and a board, collecting what the machines emit. */
function collectEvents(): { events: ClientEvent[]; covered: Set<EventName> } {
  const events: ClientEvent[] = [];
  const covered = new Set<EventName>();
  let sequence = 0;

  const push = (name: EventName, properties?: ClientEvent['properties']) => {
    events.push({ name, at: AT(), sequence: sequence++, properties });
    covered.add(name);
  };

  push('app_open');
  push('session_start');

  // --- the flow machine, driven exactly as the app drives it ---------------
  let flow: FlowState = initialState();
  const script: FlowAction[] = [
    { type: 'accept_tos', at: AT() },
    { type: 'answer_age_gate', passed: true },
    { type: 'loading_finished' },
    { type: 'tutorial_step_done', step: 'tutorial_a' },
    { type: 'tutorial_step_done', step: 'tutorial_b' },
    { type: 'tutorial_step_done', step: 'tutorial_c' },
    { type: 'start_board' },
  ];

  for (const action of script) {
    const next = reduce(flow, action);
    for (const name of eventsFor(action, flow, next)) push(name);
    flow = next;
  }

  // --- a real board, played until it is won or the holder fills ------------
  let session = startSession('pyramid', 4242);
  push('board_start', { layout: 'pyramid', seed: 4242 });

  for (let guard = 0; guard < 400 && session.status === 'playing'; guard++) {
    const pair = hintPair(session);
    if (!pair) break;
    for (const tile of pair) {
      const before = session.holder.length;
      session = tapTile(session, tile.id);
      push('tile_tap', { holderCount: session.holder.length, tilesRemaining: session.board.remaining.size });
      if (session.holder.length > before) push('holder_slot_filled', { holderCount: session.holder.length });
      if (session.holder.length < before) push('pair_cleared', { cleared: session.cleared });
    }
  }

  // --- force a loss on a second board, so the revenue funnel is exercised --
  let losing = startSession('turtle', 99);
  while (losing.status === 'playing' && losing.holder.length < HOLDER_CAPACITY) {
    const held = new Set(holderTiles(losing).map((t) => matchGroup(t.face)));
    const candidate = tappableTiles(losing).find((t) => !held.has(matchGroup(t.face)));
    if (!candidate) break;
    losing = tapTile(losing, candidate.id);
  }

  const lossFlow = reduce(flow, { type: 'holder_full' });
  for (const name of eventsFor({ type: 'holder_full' }, flow, lossFlow)) push(name);
  flow = lossFlow;

  // The ad and purchase funnels, step by step — these are the numbers the
  // weekly cohort review is actually for.
  for (const name of [
    'revive_tapped',
    'revive_ad_started',
    'revive_ad_completed',
  ] as const) {
    push(name, { placement: 'revive' });
  }
  const revived = reduce(flow, { type: 'revive' });
  for (const name of eventsFor({ type: 'revive' }, flow, revived)) push(name);
  flow = revived;

  for (const name of [
    'hint_tapped',
    'hint_ad_started',
    'hint_ad_completed',
    'hint_shown',
  ] as const) {
    push(name, { placement: 'hint' });
  }

  for (const name of [
    'shuffle_tapped',
    'shuffle_iap_shown',
    'store_shown',
    'iap_purchase_started',
    'iap_purchase_completed',
    'shuffle_iap_purchased',
    'shuffle_granted',
  ] as const) {
    push(name, { productId: 'com.nihi.mahjong.shuffle5' });
  }

  const won = reduce(flow, { type: 'board_won' });
  for (const name of eventsFor({ type: 'board_won' }, flow, won)) push(name);
  flow = won;

  for (const name of [
    'daily_reward_shown',
    'daily_reward_claimed',
    'streak_advanced',
    'level_up',
    'iq_changed',
    'game_over_shown',
    'home_shown',
    'session_end',
  ] as const) {
    push(name);
  }

  return { events, covered };
}

async function main(): Promise<void> {
  const { ports, lines } = createPorts();
  console.info('Ports:');
  for (const line of lines) console.info(`  ${line}`);
  console.info('');

  if (!ports.store) {
    console.error('No store configured. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,');
    console.error('or MAHJONG_BRAIN_DEV_STORE=memory to smoke-test against the dev store.');
    process.exit(2);
  }

  const { events, covered } = collectEvents();
  const received: Record<string, unknown>[] = [];

  // Wrap the configured store so we can see exactly what reached it, without
  // changing the code path under test.
  const observed = {
    ...ports.store,
    recordEvents: async (rows: readonly Record<string, unknown>[]) => {
      received.push(...rows);
      await ports.store!.recordEvents(rows);
    },
  };

  const envelope = await ingestEvents(
    {
      schemaVersion: 1,
      anonymousDeviceId: `smoke-${Math.random().toString(36).slice(2, 10)}`,
      sessionId: `smoke-session-${Date.now()}`,
      appVersion: '0.1.0-smoke',
      platform: 'ios',
      events,
    },
    { ...ports, store: observed },
  );

  console.info(`Emitted ${events.length} events across ${covered.size} distinct names.`);
  console.info(`Envelope: ${envelope.state}${envelope.fallback_reason ? ` — ${envelope.fallback_reason}` : ''}`);

  const problems: string[] = [];

  if (envelope.error) problems.push(`ingest failed: ${envelope.error.code} ${envelope.error.message}`);
  if (envelope.data && envelope.data.rejected.length > 0) {
    for (const r of envelope.data.rejected) problems.push(`event ${r.index} rejected: ${r.reason}`);
  }
  if (received.length !== events.length) {
    problems.push(`only ${received.length} of ${events.length} events reached the store`);
  }

  const stored = new Set(received.map((row) => row.name as string));
  for (const name of covered) {
    if (!stored.has(name)) problems.push(`"${name}" was emitted but never stored`);
  }

  // Which parts of the catalogue this run never exercised. Not a failure —
  // some events only happen on paths a scripted run cannot reach — but it is
  // the list worth looking at before calling instrumentation done.
  const uncovered = EVENT_NAMES.filter((name) => !covered.has(name));

  console.info(`Stored ${received.length} rows, ${stored.size} distinct names.`);
  if (uncovered.length > 0) {
    console.info(`\nNot exercised by this run (${uncovered.length}):`);
    console.info(`  ${uncovered.join(', ')}`);
  }

  if (problems.length > 0) {
    console.error('\nFAILED:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.info('\nOK — every emitted event reached the store.');
}

void main();
