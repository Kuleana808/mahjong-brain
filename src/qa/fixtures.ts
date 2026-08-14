/** Deterministic, development-only states for visual and accessibility QA. */

import { availableMoves, freeTiles } from '../../packages/core/src/game/board';
import { matchGroup } from '../../packages/core/src/game/tiles';
import { startSession } from '../../packages/core/src/play/session';
import { initialState, type ScreenId } from '../../packages/core/src/flow/screens';
import { useGame } from '../state/store';

export const QA_FIXTURE_IDS = [
  'S01-terms-rest',
  'S01-terms-focus',
  'S02-age-rest',
  'S03-loading',
  'S03-loading-offline',
  'S04-tutorial-match',
  'S05-tutorial-edge',
  'S06-tutorial-holder',
  'S07-home-new',
  'S07-home-progress',
  'S07-home-offline',
  'S08-game-empty',
  'S08-game-one',
  'S08-game-two',
  'S08-game-three',
  'S08-game-match',
  'S08-game-hint',
  'S08-game-blocked',
  'S08-game-shuffle',
  'S08-game-shuffle-empty',
  'S08-game-resume',
  'S09-holder-full',
  'S10-complete',
  'S12-settings',
  'S12-settings-large',
  'S12-settings-offline',
  'S16-generic-offline',
  'S17-generic-error',
  'S18-maintenance',
  'S19-theme-tiles',
  'S19-theme-backgrounds',
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
    settings: { ...useGame.getState().settings, sounds: false },
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
    'S01-terms-focus': 'tos',
    'S02-age-rest': 'age_gate',
    'S03-loading': 'loading',
    'S03-loading-offline': 'loading',
    'S04-tutorial-match': 'tutorial_a',
    'S05-tutorial-edge': 'tutorial_b',
    'S06-tutorial-holder': 'tutorial_c',
    'S07-home-new': 'home',
    'S07-home-progress': 'home',
    'S07-home-offline': 'home',
    'S19-theme-tiles': 'home',
    'S19-theme-backgrounds': 'home',
  };
  const flowScreen = flowScreens[id];
  if (flowScreen) {
    screen(flowScreen);
    if (id === 'S01-terms-focus') {
      globalThis.setTimeout(() => globalThis.document?.querySelector<HTMLElement>('.legal-link')?.focus(), 0);
    }
    if (id === 'S03-loading-offline') {
      useGame.setState({ announcement: 'You are offline. Local setup is ready and play remains available.' });
    }
    if (id === 'S07-home-progress') {
      useGame.setState((state) => ({
        boardsCompleted: 6,
        flow: { ...state.flow, progress: { ...state.flow.progress, boardsCompleted: 6 } },
        progression: { xp: 310, level: 2, iq: 112, boardsPlayed: 7, boardsWon: 6 },
      }));
    }
    if (id === 'S07-home-offline') {
      useGame.setState({ announcement: 'Offline. Your game and settings remain available on this device.' });
    }
    return;
  }

  if (id === 'S08-game-empty') gameplay(0);
  if (id === 'S08-game-one') gameplay(1);
  if (id === 'S08-game-two') gameplay(2);
  if (id === 'S08-game-three') gameplay(3);
  if (id === 'S08-game-match') {
    gameplay(0);
    const pair = availableMoves(useGame.getState().board!)[0];
    if (!pair) throw new Error('QA fixture could not find a real available pair.');
    const [first, match] = pair;
    useGame.getState().tapTile(first.id);
    globalThis.setTimeout(() => useGame.getState().tapTile(match.id), 520);
  }
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
  if (id === 'S08-game-shuffle-empty') {
    gameplay(0);
    useGame.setState((state) => ({ inventory: { ...state.inventory, shuffle: 0 } }));
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
  if (id === 'S12-settings' || id === 'S12-settings-large' || id === 'S12-settings-offline') {
    screen('home');
    useGame.setState((state) => ({
      settingsOpen: true,
      settings: { ...state.settings, fontScale: id === 'S12-settings-large' ? 2 : 1 },
      announcement: id === 'S12-settings-offline'
        ? 'Settings are saved on this device. Account sync is temporarily unavailable.'
        : '',
    }));
  }
  if (id === 'S16-generic-offline') {
    screen('home');
    useGame.setState({
      announcement: 'Saved progress could not be restored. A fresh board is ready, and local play is still available.',
    });
  }
  if (id === 'S17-generic-error') {
    screen('home');
    useGame.setState({ announcement: 'Something went wrong while syncing. Local play and saved progress remain safe.' });
  }
  if (id === 'S18-maintenance') {
    screen('home');
    useGame.setState({ announcement: 'Online services are temporarily unavailable. You can keep playing locally.' });
  }
}

export function qaFixtureFromLocation(): QaFixtureId | null {
  const requested = new URLSearchParams(window.location.search).get('qa');
  return QA_FIXTURE_IDS.includes(requested as QaFixtureId) ? (requested as QaFixtureId) : null;
}

export function qaFixtureActive(): boolean {
  return qaFixtureFromLocation() !== null;
}
