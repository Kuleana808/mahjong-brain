/** Deterministic, development-only states for visual and accessibility QA. */

import { freeTiles } from '../../packages/core/src/game/board';
import { matchGroup } from '../../packages/core/src/game/tiles';
import { startSession } from '../../packages/core/src/play/session';
import { initialState, type ScreenId } from '../../packages/core/src/flow/screens';
import { useGame } from '../state/store';

export const QA_FIXTURE_IDS = [
  'S01-terms-rest',
  'S02-age-rest',
  'S03-loading',
  'S04-tutorial-match',
  'S05-tutorial-edge',
  'S06-tutorial-holder',
  'S07-home-new',
  'S08-game-empty',
  'S08-game-one',
  'S08-game-two',
  'S08-game-three',
  'S08-game-hint',
  'S08-game-blocked',
  'S08-game-shuffle',
  'S08-game-resume',
  'S09-holder-full',
  'S10-complete',
  'S12-settings',
  'S12-settings-large',
  'S16-generic-offline',
] as const;

export type QaFixtureId = (typeof QA_FIXTURE_IDS)[number];

const completedProgress = {
  tosAcceptedAt: '2026-08-10T00:00:00.000Z',
  agePassed: true,
  tutorialCompleted: 'tutorial_c' as const,
  tutorialSkipped: false,
  boardsCompleted: 0,
};

const screen = (screenId: ScreenId) =>
  useGame.setState({ flow: { ...initialState(completedProgress), screen: screenId } });

function gameplay(holderCount = 0): void {
  const session = startSession('pyramid', 0x4d41484a);
  useGame.setState({
    flow: { ...initialState(completedProgress), screen: 'gameplay' },
    board: session.board,
    holder: [],
    tapHistory: [],
    undoBaseline: { board: session.board, holder: [], status: 'playing' },
    status: 'playing',
    selectedId: null,
    hint: null,
    hintPending: false,
    settingsOpen: false,
    paywallOpen: false,
    announcement: '',
  });

  for (let index = 0; index < holderCount; index++) {
    const state = useGame.getState();
    const heldGroups = new Set(
      state.holder.map((id) => matchGroup(state.board!.tiles.find((tile) => tile.id === id)!.face)),
    );
    const candidate = freeTiles(state.board!).find((tile) => !heldGroups.has(matchGroup(tile.face)));
    if (!candidate) throw new Error(`QA fixture could not create holder state ${holderCount}.`);
    state.tapTile(candidate.id);
  }
}

export async function applyQaFixture(id: QaFixtureId): Promise<void> {
  useGame.setState({ hydrated: true, settingsOpen: false, paywallOpen: false, announcement: '' });
  const flowScreens: Partial<Record<QaFixtureId, ScreenId>> = {
    'S01-terms-rest': 'tos',
    'S02-age-rest': 'age_gate',
    'S03-loading': 'loading',
    'S04-tutorial-match': 'tutorial_a',
    'S05-tutorial-edge': 'tutorial_b',
    'S06-tutorial-holder': 'tutorial_c',
    'S07-home-new': 'home',
  };
  const flowScreen = flowScreens[id];
  if (flowScreen) {
    screen(flowScreen);
    return;
  }

  if (id === 'S08-game-empty') gameplay(0);
  if (id === 'S08-game-one') gameplay(1);
  if (id === 'S08-game-two') gameplay(2);
  if (id === 'S08-game-three') gameplay(3);
  if (id === 'S08-game-hint') {
    gameplay(2);
    await useGame.getState().requestHint();
  }
  if (id === 'S08-game-blocked') {
    gameplay(0);
    const state = useGame.getState();
    const free = new Set(freeTiles(state.board!).map((tile) => tile.id));
    const blocked = state.board!.tiles.find((tile) => state.board!.remaining.has(tile.id) && !free.has(tile.id));
    if (blocked) state.tapTile(blocked.id);
  }
  if (id === 'S08-game-shuffle') {
    gameplay(2);
    useGame.getState().shuffleBoard();
  }
  if (id === 'S08-game-resume') {
    gameplay(1);
    useGame.setState({ announcement: 'Saved game restored. One of four holder slots occupied.' });
  }
  if (id === 'S09-holder-full') gameplay(4);
  if (id === 'S10-complete') {
    gameplay(0);
    useGame.setState((state) => ({
      flow: { ...state.flow, screen: 'game_over' },
      board: state.board ? { ...state.board, remaining: new Set(), removed: [] } : null,
      holder: [],
      status: 'complete',
    }));
  }
  if (id === 'S12-settings' || id === 'S12-settings-large') {
    screen('home');
    useGame.setState((state) => ({
      settingsOpen: true,
      settings: { ...state.settings, fontScale: id === 'S12-settings-large' ? 1.45 : 1 },
    }));
  }
  if (id === 'S16-generic-offline') {
    screen('home');
    useGame.setState({
      announcement: 'Saved progress could not be restored. A fresh board is ready, and local play is still available.',
    });
  }
}

export function qaFixtureFromLocation(): QaFixtureId | null {
  const requested = new URLSearchParams(window.location.search).get('qa');
  return QA_FIXTURE_IDS.includes(requested as QaFixtureId) ? (requested as QaFixtureId) : null;
}

export function qaFixtureActive(): boolean {
  return qaFixtureFromLocation() !== null;
}
