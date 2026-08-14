/**
 * Session flow, in full: open the app, a board is there.
 *
 * No splash, no menu, no mode picker, no login. If a board was in progress it
 * is restored; if not, one is dealt. The player's first action is always a tap
 * on a tile.
 */

import { useEffect, useState } from 'react';

import { paletteFor } from '../render/palette';
import {
  startNativeAccessibilityPreferences,
  type NativeAccessibilityPreferences,
} from '../accessibility/native';
import { configureNativePurchases } from '../iap';
import { setAmbientMusicEnabled } from '../audio/sounds';
import { flushPersisted } from '../state/persist';
import { useGame } from '../state/store';
import { startTelemetryLifecycle } from '../telemetry/client';
import { BoardView } from './BoardView';
import { BottomDock } from './BottomDock';
import { Paywall, SettingsSheet } from './Overlays';
import { FlowRouter } from './FlowScreens';
import { HintBar } from './HintBar';
import { Holder } from './Holder';
import { TopBar } from './TopBar';

export function App() {
  const [nativeAccessibility, setNativeAccessibility] = useState<NativeAccessibilityPreferences>({
    textScale: 1,
    reduceMotion: false,
    increaseContrast: false,
  });
  const hydrate = useGame((s) => s.hydrate);
  const hydrated = useGame((s) => s.hydrated);
  const settings = useGame((s) => s.settings);
  const screen = useGame((s) => s.flow.screen);
  const paywallOpen = useGame((s) => s.paywallOpen);
  const settingsOpen = useGame((s) => s.settingsOpen);
  const announcement = useGame((s) => s.announcement);
  const dismissAnnouncement = useGame((s) => s.dismissAnnouncement);

  useEffect(() => {
    configureNativePurchases();
    void hydrate().then(async () => {
      if (import.meta.env.DEV) {
        const { applyQaFixture, qaFixtureFromLocation } = await import('../qa/fixtures');
        const fixture = qaFixtureFromLocation();
        if (fixture) await applyQaFixture(fixture);
      }
    });
  }, [hydrate]);

  useEffect(() => startTelemetryLifecycle(), []);
  useEffect(() => {
    const preserveLatestMove = () => {
      if (document.visibilityState === 'hidden') void flushPersisted();
    };
    document.addEventListener('visibilitychange', preserveLatestMove);
    window.addEventListener('pagehide', preserveLatestMove);
    return () => {
      document.removeEventListener('visibilitychange', preserveLatestMove);
      window.removeEventListener('pagehide', preserveLatestMove);
    };
  }, []);
  useEffect(
    () => startNativeAccessibilityPreferences(setNativeAccessibility),
    [],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [screen]);

  // Push the palette into CSS so the chrome and the canvas cannot drift apart.
  useEffect(() => {
    const palette = paletteFor(settings.theme, settings.tileStyle);
    const root = document.documentElement;
    root.style.setProperty('--felt', palette.felt);
    root.style.setProperty('--felt-edge', palette.feltEdge);
    root.style.setProperty('--ink', palette.ink);
    root.style.setProperty('--ink-soft', palette.inkSoft);
    root.style.setProperty('--surface', palette.tileFace);
    root.style.setProperty('--edge', palette.tileEdge);
    root.style.setProperty('--accent', palette.selected);
    root.style.setProperty('--hint', palette.hinted);
    root.style.setProperty('--font-scale', String(settings.fontScale * nativeAccessibility.textScale));
    root.style.colorScheme = settings.theme === 'calm-dark' ? 'dark' : 'light';
  }, [settings.theme, settings.tileStyle, settings.fontScale, nativeAccessibility.textScale]);

  useEffect(() => {
    setAmbientMusicEnabled(settings.music);
    return () => setAmbientMusicEnabled(false);
  }, [settings.music]);

  if (!hydrated) {
    return (
      <div className="app app--boot" role="status" aria-label="Opening Mahjong Brain">
        <img src="/brand-mark.png" alt="" width="112" height="112" />
        <span>Mahjong Brain</span>
      </div>
    );
  }

  const isGameplay = screen === 'gameplay';
  const isSettings = settingsOpen;

  return (
    <div
      className={`app ${isSettings ? 'app--settings' : isGameplay ? 'app--gameplay' : 'app--flow'}`}
      data-reduce-motion={settings.reduceMotion || nativeAccessibility.reduceMotion}
      data-increase-contrast={nativeAccessibility.increaseContrast}
      data-large-text={settings.fontScale * nativeAccessibility.textScale >= 1.8}
    >
      {isSettings ? (
        <SettingsSheet />
      ) : isGameplay ? (
        <>
          <TopBar />
          <Holder />
          <BoardView />
          <HintBar />
          <BottomDock />
        </>
      ) : (
        <FlowRouter />
      )}

      {/* Every state change the player cannot see, spoken once. */}
      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>

      {announcement.includes('Saved progress could not be restored') ? (
        <aside className="recovery-banner" role="status">
          <span>{announcement}</span>
          <button type="button" onClick={dismissAnnouncement}>Got it</button>
        </aside>
      ) : null}

      {paywallOpen ? <Paywall /> : null}
    </div>
  );
}
