/**
 * Session flow, in full: open the app, a board is there.
 *
 * No splash, no menu, no mode picker, no login. If a board was in progress it
 * is restored; if not, one is dealt. The player's first action is always a tap
 * on a tile.
 */

import { useEffect } from 'react';

import { PALETTES } from '../render/palette';
import { useGame } from '../state/store';
import { BoardView } from './BoardView';
import { CompletionCard, Paywall, SettingsSheet } from './Overlays';
import { HintBar } from './HintBar';
import { TopBar } from './TopBar';

export function App() {
  const hydrate = useGame((s) => s.hydrate);
  const hydrated = useGame((s) => s.hydrated);
  const settings = useGame((s) => s.settings);
  const status = useGame((s) => s.status);
  const paywallOpen = useGame((s) => s.paywallOpen);
  const settingsOpen = useGame((s) => s.settingsOpen);
  const announcement = useGame((s) => s.announcement);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Push the palette into CSS so the chrome and the canvas cannot drift apart.
  useEffect(() => {
    const palette = PALETTES[settings.theme];
    const root = document.documentElement;
    root.style.setProperty('--felt', palette.felt);
    root.style.setProperty('--felt-edge', palette.feltEdge);
    root.style.setProperty('--ink', palette.ink);
    root.style.setProperty('--ink-soft', palette.inkSoft);
    root.style.setProperty('--surface', palette.tileFace);
    root.style.setProperty('--edge', palette.tileEdge);
    root.style.setProperty('--accent', palette.selected);
    root.style.setProperty('--hint', palette.hinted);
    root.style.setProperty('--font-scale', String(settings.fontScale));
    root.style.colorScheme = settings.theme === 'calm-dark' ? 'dark' : 'light';
  }, [settings.theme, settings.fontScale]);

  return (
    <div className="app" data-reduce-motion={settings.reduceMotion}>
      <TopBar />
      <BoardView />
      <HintBar />

      {/* Every state change the player cannot see, spoken once. */}
      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>

      {hydrated && status === 'complete' && !paywallOpen ? <CompletionCard /> : null}
      {paywallOpen ? <Paywall /> : null}
      {settingsOpen ? <SettingsSheet /> : null}
    </div>
  );
}
