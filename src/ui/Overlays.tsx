/**
 * The three cards that can sit over the board: finished, paywall, settings.
 *
 * Each is a single decision or none at all. The completion card has one button.
 * The paywall has one price and one product. Settings has five switches and no
 * sub-pages.
 */

import { useEffect, useRef, type ReactNode } from 'react';

import { PRICE_DISPLAY, purchasesConfigured } from '../iap';
import { useGame, type Settings } from '../state/store';

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
  const start = useGame((s) => s.start);
  const boardsCompleted = useGame((s) => s.boardsCompleted);

  return (
    <Overlay label="Board complete">
      <h2>Board clear</h2>
      <p>
        {boardsCompleted === 1
          ? 'That is one board down.'
          : `That is ${boardsCompleted} boards down.`}
      </p>
      <button type="button" className="button" onClick={() => start()}>
        Play again
      </button>
    </Overlay>
  );
}

export function Paywall() {
  const buy = useGame((s) => s.buy);
  const restore = useGame((s) => s.restore);
  const close = useGame((s) => s.closePaywall);

  return (
    <Overlay label="Unlock Mahjong Brain">
      <h2>Keep it quiet, for good</h2>
      <p>You have played three boards. Here is the only thing we will ever ask.</p>

      <strong className="card__price">{PRICE_DISPLAY}</strong>
      <p style={{ marginTop: '-0.75rem' }}>Once. Not a subscription.</p>

      <ul className="card__list">
        <li>The AI hint coach, which explains the pattern instead of just naming a pair</li>
        <li>Every layout, now and later</li>
        <li>No ads — there were never going to be any</li>
        <li>No timers, no streaks, no daily check-ins</li>
      </ul>

      <button type="button" className="button" onClick={() => void buy()}>
        Unlock for {PRICE_DISPLAY}
      </button>
      <button type="button" className="button button--quiet" onClick={() => void restore()}>
        Restore purchase
      </button>
      <button type="button" className="button button--quiet" onClick={close}>
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

const SIZES: { value: number; label: string }[] = [
  { value: 1, label: 'Normal' },
  { value: 1.2, label: 'Large' },
  { value: 1.45, label: 'Largest' },
];

export function SettingsSheet() {
  const settings = useGame((s) => s.settings);
  const update = useGame((s) => s.updateSettings);
  const openSettings = useGame((s) => s.openSettings);
  const start = useGame((s) => s.start);
  const unlocked = useGame((s) => s.unlocked);
  const restore = useGame((s) => s.restore);
  const accountStatus = useGame((s) => s.accountStatus);
  const accountError = useGame((s) => s.accountError);
  const signIn = useGame((s) => s.signIn);
  const signOut = useGame((s) => s.signOut);

  return (
    <Overlay label="Settings">
      <h2>Settings</h2>

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
        onClick={() => {
          openSettings(false);
          start();
        }}
      >
        New board
      </button>
      {!unlocked && purchasesConfigured() ? (
        <button type="button" className="button button--quiet" onClick={() => void restore()}>
          Restore purchase
        </button>
      ) : null}
    </Overlay>
  );
}
