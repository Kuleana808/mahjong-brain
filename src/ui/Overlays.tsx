/**
 * The three cards that can sit over the board: finished, paywall, settings.
 *
 * Each is a single decision or none at all. The completion card has one button.
 * The paywall has one price and one product. Settings has five switches and no
 * sub-pages.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { levelProgress, xpForLevel } from '../../packages/core/src/progression/progression';
import { purchasesConfigured } from '../iap';
import { useGame, type Settings } from '../state/store';
import { Icon } from './Icon';

function Overlay({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // Move focus into the card so a keyboard or screen-reader user is not left
  // behind on the board underneath.
  useEffect(() => {
    const heading = ref.current?.querySelector<HTMLElement>('h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, []);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={label}>
      <div className="card" ref={ref}>
        {children}
      </div>
    </div>
  );
}

export function CompletionCard() {
  const newBoard = useGame((s) => s.newBoard);
  const boardsCompleted = useGame((s) => s.boardsCompleted);

  return (
    <Overlay label="Board complete">
      <h2>Board clear</h2>
      <p>
        {boardsCompleted === 1
          ? 'That is one board down.'
          : `That is ${boardsCompleted} boards down.`}
      </p>
      <button type="button" className="button" onClick={() => newBoard()}>
        Play again
      </button>
    </Overlay>
  );
}

export function LevelsSheet({ onClose }: { onClose: () => void }) {
  const progression = useGame((s) => s.progression);
  const progress = levelProgress(progression.xp);
  const levelFloor = xpForLevel(progression.level);
  const levelCeiling = xpForLevel(progression.level + 1);
  const earnedThisLevel = progression.xp - levelFloor;
  const neededThisLevel = levelCeiling - levelFloor;
  const firstVisibleLevel = Math.max(1, progression.level - 2);
  const visibleLevels = Array.from({ length: 5 }, (_, index) => firstVisibleLevel + index);

  return (
    <Overlay label="Levels">
      <h2>Levels</h2>
      <div className="levels-layout">
        <ol className="level-path" aria-label="Level path">
          {visibleLevels.map((level) => (
            <li
              key={level}
              className={level === progression.level ? 'is-current' : level < progression.level ? 'is-complete' : 'is-locked'}
              aria-current={level === progression.level ? 'step' : undefined}
            >
              <span>{level}</span>
              <small>{level < progression.level ? 'Complete' : level === progression.level ? 'Current' : 'Locked'}</small>
            </li>
          ))}
        </ol>
        <section className="level-card" aria-label={`Current level ${progression.level}`}>
          <span>Level</span>
          <strong>{progression.level}</strong>
          <div className="home-progress" aria-label={`${Math.round(progress * 100)} percent to next level`}>
            <span style={{ width: `${Math.max(4, progress * 100)}%` }} />
          </div>
          <small>{earnedThisLevel} of {neededThisLevel} XP</small>
          <hr />
          <span>IQ estimate</span>
          <b>{progression.iq}</b>
          <small>{progression.boardsWon} of {progression.boardsPlayed} boards cleared</small>
        </section>
      </div>
      <button type="button" className="button" onClick={onClose}>Done</button>
    </Overlay>
  );
}

export function Paywall() {
  const buy = useGame((s) => s.buy);
  const restore = useGame((s) => s.restore);
  const close = useGame((s) => s.closePaywall);
  const pending = useGame((s) => s.purchasePending);
  const displayPrice = useGame((s) => s.purchaseDisplayPrice);

  return (
    <Overlay label="Unlock Mahjong Brain">
      <h2>Keep it quiet, for good</h2>
      <p>You have played three boards. Here is the only thing we will ever ask.</p>

      <strong className="card__price">{displayPrice ?? 'Store unavailable'}</strong>
      <p style={{ marginTop: '-0.75rem' }}>Once. Not a subscription.</p>

      <ul className="card__list">
        <li>The AI hint coach, which explains the pattern instead of just naming a pair</li>
        <li>Every layout, now and later</li>
        <li>No ads — there were never going to be any</li>
        <li>No timers, no streaks, no daily check-ins</li>
      </ul>

      <button type="button" className="button" disabled={pending !== null || !displayPrice} onClick={() => void buy()}>
        {pending === 'buying' ? 'Contacting Apple…' : displayPrice ? `Unlock for ${displayPrice}` : 'Try again later'}
      </button>
      <button type="button" className="button button--quiet" disabled={pending !== null} onClick={() => void restore()}>
        {pending === 'restoring' ? 'Checking with Apple…' : 'Restore purchase'}
      </button>
      <button type="button" className="button button--quiet" disabled={pending !== null} onClick={close}>
        Not now
      </button>
    </Overlay>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="setting">
      <span className="setting__label">
        {label}
        {hint ? <span className="setting__hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

const THEMES: { id: Settings['theme']; label: string }[] = [
  { id: 'calm', label: 'Light' },
  { id: 'calm-dark', label: 'Dark' },
  { id: 'high-contrast', label: 'High contrast' },
];

const TILE_STYLES: { id: Settings['tileStyle']; label: string }[] = [
  { id: 'ivory', label: 'Ivory' },
  { id: 'jade-edge', label: 'Jade edge' },
  { id: 'porcelain', label: 'Porcelain' },
];

const SIZES: { value: number; label: string }[] = [
  { value: 1, label: 'Normal' },
  { value: 1.2, label: 'Large' },
  { value: 1.45, label: 'Largest' },
];

export function ThemeSheet({ onClose }: { onClose: () => void }) {
  const settings = useGame((s) => s.settings);
  const update = useGame((s) => s.updateSettings);
  const [tab, setTab] = useState<'tiles' | 'background'>('tiles');

  return (
    <Overlay label="Theme">
      <div className="sheet-titlebar">
        <h2>Theme</h2>
        <button type="button" className="sheet-close" aria-label="Close theme" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="theme-tabs" role="tablist" aria-label="Theme category">
        <button type="button" role="tab" aria-selected={tab === 'tiles'} onClick={() => setTab('tiles')}>Tiles</button>
        <button type="button" role="tab" aria-selected={tab === 'background'} onClick={() => setTab('background')}>Background</button>
      </div>
      {tab === 'tiles' ? (
        <div className="theme-options">
          {TILE_STYLES.map((style) => (
            <button key={style.id} type="button" className="theme-option" aria-pressed={settings.tileStyle === style.id} onClick={() => update({ tileStyle: style.id })}>
              <span className={`theme-swatch theme-swatch--${style.id}`}><i>中</i><i>●●<br />●●</i><i>發</i></span>
              <strong>{style.label}</strong>
            </button>
          ))}
        </div>
      ) : (
        <div className="background-options">
          {THEMES.map((theme) => (
            <button key={theme.id} type="button" className={`background-swatch background-swatch--${theme.id}`} aria-label={theme.label} aria-pressed={settings.theme === theme.id} onClick={() => update({ theme: theme.id })}>
              <span>{theme.label}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="button" onClick={onClose}>Confirm</button>
    </Overlay>
  );
}

export function SettingsSheet() {
  const settings = useGame((s) => s.settings);
  const update = useGame((s) => s.updateSettings);
  const openSettings = useGame((s) => s.openSettings);
  const newBoard = useGame((s) => s.newBoard);
  const unlocked = useGame((s) => s.unlocked);
  const restore = useGame((s) => s.restore);
  const purchasePending = useGame((s) => s.purchasePending);
  const accountStatus = useGame((s) => s.accountStatus);
  const accountError = useGame((s) => s.accountError);
  const signIn = useGame((s) => s.signIn);
  const signOut = useGame((s) => s.signOut);

  return (
    <main className="settings-screen" aria-labelledby="settings-title">
      <section className="settings-screen__panel">
      <div className="settings-header">
        <button
          type="button"
          className="settings-header__back"
          aria-label="Back"
          onClick={() => openSettings(false)}
        >
          <Icon name="back" size={26} />
        </button>
        <h1 id="settings-title">Settings</h1>
      </div>

      <div className="settings-screen__content">

      <div className="setting">
        <span className="setting__label">Appearance</span>
        <div className="segmented">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              aria-pressed={settings.theme === theme.id}
              onClick={() => update({ theme: theme.id })}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting">
        <span className="setting__label">Text size</span>
        <div className="segmented">
          {SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              aria-pressed={settings.fontScale === size.value}
              onClick={() => update({ fontScale: size.value })}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting">
        <span className="setting__label">Tile design</span>
        <div className="segmented">
          {TILE_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              aria-pressed={settings.tileStyle === style.id}
              onClick={() => update({ tileStyle: style.id })}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      <Switch
        label="Dim blocked tiles"
        hint="Shows at a glance which tiles you can take"
        checked={settings.dimBlocked}
        onChange={(dimBlocked) => update({ dimBlocked })}
      />
      <Switch
        label="Reduce motion"
        checked={settings.reduceMotion}
        onChange={(reduceMotion) => update({ reduceMotion })}
      />
      <Switch
        label="Sounds"
        hint="Quiet tile and game feedback"
        checked={settings.sounds}
        onChange={(sounds) => update({ sounds })}
      />
      <Switch
        label="Vibration"
        checked={settings.haptics}
        onChange={(haptics) => update({ haptics })}
      />

      {accountStatus !== 'unavailable' ? (
        <div className="account-setting">
          <span className="setting__label">
            Apple account
            <span className="setting__hint">
              {accountStatus === 'signed_in'
                ? 'Signed in. Settings and a verified unlock can follow you to another device.'
                : 'Optional. Free play and local progress never require an account.'}
            </span>
          </span>
          {accountStatus === 'signed_in' ? (
            <button type="button" className="button button--quiet" onClick={() => void signOut()}>
              Sign out
            </button>
          ) : (
            <button
              type="button"
              className="apple-sign-in"
              disabled={accountStatus === 'signing_in'}
              onClick={() => void signIn()}
            >
              <span aria-hidden="true"></span>{' '}
              {accountStatus === 'signing_in' ? 'Signing in…' : 'Sign in with Apple'}
            </button>
          )}
          {accountError ? <p className="account-setting__error" role="alert">{accountError}</p> : null}
        </div>
      ) : null}

      <button
        type="button"
        className="button"
        style={{ marginTop: '1.5rem' }}
        onClick={() => openSettings(false)}
      >
        Done
      </button>
      <button
        type="button"
        className="button button--quiet"
        onClick={() => newBoard()}
      >
        New board
      </button>
      {!unlocked && purchasesConfigured() ? (
        <button type="button" className="button button--quiet" disabled={purchasePending !== null} onClick={() => void restore()}>
          {purchasePending === 'restoring' ? 'Checking with Apple…' : 'Restore purchase'}
        </button>
      ) : null}
      </div>
      </section>
    </main>
  );
}
