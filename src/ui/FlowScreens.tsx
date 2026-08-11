import { useEffect, useRef, useState, type ReactNode } from 'react';
import { levelProgress as progressionFraction } from '../../packages/core/src/progression/progression';
import { useGame } from '../state/store';
import { Icon } from './Icon';
import { LevelsSheet } from './Overlays';

function BrainLeafMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand-tile brand-tile--compact' : 'brand-tile'} aria-hidden="true">
      <svg viewBox="0 0 120 140" role="img">
        <path d="M60 28c-8-14-30-9-30 9-15 1-19 23-6 30-9 13 2 30 16 27 4 10 15 14 20 6V28Z" />
        <path d="M60 28c8-14 30-9 30 9 15 1 19 23 6 30 9 13-2 30-16 27-4 10-15 14-20 6V28Z" />
        <path d="M60 98v24M60 112c-15-2-25-9-31-20M60 112c15-2 25-9 31-20" />
      </svg>
    </div>
  );
}

function DecorativeTiles() {
  return (
    <div className="decorative-tiles" aria-hidden="true">
      <span className="demo-tile demo-tile--lean-left">一</span>
      <span className="demo-tile demo-tile--hero">中</span>
      <span className="demo-tile demo-tile--lean-right">●●<br />●●</span>
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="brand-heading">
      <span>Mahjong</span>
      <span>Brain</span>
      <i aria-hidden="true" />
    </div>
  );
}

function ScreenFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`flow-screen ${className}`}>{children}</main>;
}

type LegalDocument = 'terms' | 'privacy';

function LegalDocumentDialog({ document, onClose }: { document: LegalDocument; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  const isPrivacy = document === 'privacy';
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="legal-title">
      <article className="card legal-card">
        <h2 ref={titleRef} id="legal-title" tabIndex={-1}>{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</h2>
        {isPrivacy ? (
          <>
            <p>Mahjong Brain is designed to work without advertising profiles. We do not store your email address.</p>
            <h3>Information we use</h3>
            <p>We save game progress and settings on your device. If you choose Sign in with Apple, the service receives the Apple account identifier needed to protect your unlock status. Anonymous session events may be used to understand crashes and game completion; those events do not include an account identifier.</p>
            <h3>Purchases</h3>
            <p>Apple processes payments. We verify purchase records only to restore the unlock to the correct account and prevent one purchase from unlocking multiple accounts.</p>
            <h3>Your choices</h3>
            <p>You can play without personalized advertising. Device permissions remain under your control in iOS Settings.</p>
          </>
        ) : (
          <>
            <p>Mahjong Brain is a calm tile-matching game. By accepting, you agree to use the app lawfully and to follow the rules shown in the tutorial.</p>
            <h3>Game and availability</h3>
            <p>Game progress may be interrupted by device, network, or service conditions. We may update layouts, features, and compatibility while preserving purchases that Apple confirms as valid.</p>
            <h3>Purchases</h3>
            <p>Any purchase is handled by Apple and is subject to Apple’s payment terms. Purchase restoration succeeds only after the receipt is securely verified.</p>
            <h3>Fair use</h3>
            <p>Do not attempt to interfere with the service, impersonate another player, or bypass purchase verification.</p>
          </>
        )}
        <button type="button" className="button" onClick={onClose}>Done</button>
      </article>
    </div>
  );
}

export function TermsScreen() {
  const dispatch = useGame((s) => s.dispatchFlow);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  return (
    <ScreenFrame className="flow-screen--terms">
      <div className="ornament ornament--top" />
      <BrainLeafMark />
      <section className="jade-panel">
        <h1>Welcome to<br />Mahjong Brain!</h1>
        <p>
          Please read and accept our{' '}
          <button type="button" className="legal-link" onClick={() => setLegalDocument('terms')}>Terms of Service</button>
          {' '}and{' '}
          <button type="button" className="legal-link" onClick={() => setLegalDocument('privacy')}>Privacy Policy</button>.
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={() => dispatch({ type: 'accept_tos', at: new Date().toISOString() })}
        >
          Accept
        </button>
      </section>
      {legalDocument ? <LegalDocumentDialog document={legalDocument} onClose={() => setLegalDocument(null)} /> : null}
    </ScreenFrame>
  );
}

export function AgeScreen() {
  const dispatch = useGame((s) => s.dispatchFlow);
  const choose = () => dispatch({ type: 'answer_age_gate', passed: true });
  return (
    <ScreenFrame className="flow-screen--age">
      <DecorativeTiles />
      <section className="jade-panel">
        <h1>Welcome!</h1>
        <p>Could you share your age to improve our game experience?</p>
        <div className="age-options" aria-label="Age range">
          <button type="button" className="ivory-button" onClick={choose}>0–35</button>
          <button type="button" className="ivory-button" onClick={choose}>35–55</button>
          <button type="button" className="ivory-button" onClick={choose}>55+</button>
        </div>
      </section>
    </ScreenFrame>
  );
}

export function LoadingScreen() {
  const dispatch = useGame((s) => s.dispatchFlow);
  useEffect(() => {
    const id = window.setTimeout(() => dispatch({ type: 'loading_finished' }), 900);
    return () => window.clearTimeout(id);
  }, [dispatch]);

  return (
    <ScreenFrame className="flow-screen--loading">
      <span className="demo-tile demo-tile--loading" aria-hidden="true">中</span>
      <h1>Rest your mind<br />for a moment.</h1>
      <p className="quote-credit">— Mahjong Brain</p>
      <div className="progress-track" aria-label="Loading">
        <span />
      </div>
    </ScreenFrame>
  );
}

function TutorialFrame({
  step,
  title,
  children,
  continueDisabled = false,
}: {
  step: 'tutorial_a' | 'tutorial_b' | 'tutorial_c';
  title: string;
  children: ReactNode;
  continueDisabled?: boolean;
}) {
  const dispatch = useGame((s) => s.dispatchFlow);
  return (
    <ScreenFrame className="flow-screen--tutorial">
      <div className="tutorial-progress" aria-label={`Tutorial ${step.at(-1)?.toUpperCase()}`}>
        <span className="is-complete" /><span className={step !== 'tutorial_a' ? 'is-complete' : ''} />
        <span className={step === 'tutorial_c' ? 'is-complete' : ''} />
      </div>
      <h1>{title}</h1>
      <div className="tutorial-demo">{children}</div>
      <button
        type="button"
        className="primary-button"
        disabled={continueDisabled}
        onClick={() => dispatch({ type: 'tutorial_step_done', step })}
      >
        {step === 'tutorial_c' ? 'Start playing' : 'Continue'}
      </button>
      <button type="button" className="text-button" onClick={() => dispatch({ type: 'skip_tutorial' })}>
        Skip tutorial
      </button>
    </ScreenFrame>
  );
}

export function TutorialMatchScreen() {
  const [picked, setPicked] = useState<number[]>([]);
  const [matched, setMatched] = useState(false);
  const [removed, setRemoved] = useState(false);
  const heldTiles = removed ? [] : picked;

  const pick = (id: number) => {
    if (picked.includes(id) || matched || removed) return;
    const next = [...picked, id];
    setPicked(next);
    if (next.length === 2) {
      setMatched(true);
      window.setTimeout(() => setRemoved(true), 180);
    }
  };

  return (
    <TutorialFrame step="tutorial_a" title="Match identical tiles to clear them from the board." continueDisabled={!removed}>
      <div className={`holder-demo ${matched && !removed ? 'holder-demo--matching' : ''}`} aria-label={`${heldTiles.length} of 4 holder slots filled`}>
        {heldTiles.map((id) => <span key={id}>中</span>)}
        {Array.from({ length: 4 - heldTiles.length }, (_, index) => <i key={`empty-${index}`} />)}
      </div>
      <div className={`tutorial-pair ${matched ? 'is-matching' : ''} ${removed ? 'is-removed' : ''}`}>
        {[1, 2].map((id) => (
          <button key={id} type="button" className="demo-tile" aria-label={`Red dragon tile ${id}`} aria-pressed={picked.includes(id)} onClick={() => pick(id)}>
            中
          </button>
        ))}
      </div>
      <p className="tutorial-note" aria-live="polite">
        {removed ? 'Matched. Both tiles cleared.' : picked.length === 1 ? 'Now choose its match.' : 'Choose either tile.'}
      </p>
    </TutorialFrame>
  );
}

export function TutorialEdgeScreen() {
  const [freeRemoved, setFreeRemoved] = useState(false);
  const [blockedAttempted, setBlockedAttempted] = useState(false);
  return (
    <TutorialFrame step="tutorial_b" title="Remove edge tiles to unlock trapped tiles." continueDisabled={!freeRemoved || !blockedAttempted}>
      <div className="mini-board" role="group" aria-label="Free-edge tile example">
        <button type="button" className={`demo-tile is-free ${freeRemoved ? 'is-removed' : ''}`} aria-label="East wind, free edge tile" onClick={() => setFreeRemoved(true)}>東</button>
        <button type="button" className="demo-tile is-blocked" aria-label="One circle, blocked tile" onClick={() => setBlockedAttempted(true)}>●</button>
        <span className="demo-tile" aria-hidden="true">九</span>
        <span className="demo-tile is-free" aria-hidden="true">發</span><span className="demo-tile" aria-hidden="true">中</span>
      </div>
      <p className="tutorial-note" aria-live="polite">
        {blockedAttempted
          ? freeRemoved
            ? 'Exactly. Edge tiles move; trapped tiles wait.'
            : 'That tile is blocked on both sides. Try the glowing edge tile.'
          : freeRemoved
            ? 'Good. Now tap the center tile to see why it was blocked.'
            : 'Tap the glowing edge tile, then try the center tile.'}
      </p>
    </TutorialFrame>
  );
}

export function TutorialHolderScreen() {
  return (
    <TutorialFrame step="tutorial_c" title="Watch the holder. Four unmatched tiles end the round.">
      <div className="holder-demo holder-demo--warning">
        <span>東</span><span>中</span><span>●</span><i />
      </div>
      <p className="tutorial-note">Match pairs before the final slot fills.</p>
    </TutorialFrame>
  );
}

export function HomeScreen() {
  const dispatch = useGame((s) => s.dispatchFlow);
  const openSettings = useGame((s) => s.openSettings);
  const settings = useGame((s) => s.settings);
  const updateSettings = useGame((s) => s.updateSettings);
  const progression = useGame((s) => s.progression);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const level = progression.level;
  const progress = progressionFraction(progression.xp);
  const cycleAppearance = () => {
    const next = settings.theme === 'calm'
      ? 'calm-dark'
      : settings.theme === 'calm-dark'
        ? 'high-contrast'
        : 'calm';
    updateSettings({ theme: next });
  };
  return (
    <ScreenFrame className="flow-screen--home">
      <BrandHeader />
      <div className="home-mark"><BrainLeafMark /></div>
      <div className="home-progress" aria-label={`Level progress ${Math.round(progress * 100)} percent`}>
        <span style={{ width: `${Math.max(8, progress * 100)}%` }} />
      </div>
      <button type="button" className="primary-button primary-button--level" onClick={() => dispatch({ type: 'start_board' })}>
        Level {level}
      </button>
      <div className="home-actions">
        <button type="button" className="medallion" aria-label="Levels and profile" onClick={() => setLevelsOpen(true)}><Icon name="profile" /></button>
        <button type="button" className="medallion" aria-label="Change appearance" onClick={cycleAppearance}><Icon name="daily" /></button>
        <button type="button" className="medallion" aria-label="Settings" onClick={() => openSettings(true)}><Icon name="settings" /></button>
      </div>
      {levelsOpen ? <LevelsSheet onClose={() => setLevelsOpen(false)} /> : null}
    </ScreenFrame>
  );
}

export function ResultScreen() {
  const dispatch = useGame((s) => s.dispatchFlow);
  const completed = useGame((s) => s.boardsCompleted);
  const status = useGame((s) => s.status);
  const freeReviveAvailable = useGame((s) => s.freeReviveAvailable);
  const revive = useGame((s) => s.revive);
  const isFull = status === 'holder_full';
  return (
    <ScreenFrame className="flow-screen--result">
      <div className="result-card">
        <BrainLeafMark compact />
        <p className="result-kicker">{isFull ? 'Round paused' : 'Beautiful work'}</p>
        <h1>{isFull ? 'Out of space' : 'Board clear'}</h1>
        <p>
          {isFull
            ? 'Four unmatched tiles filled the holder. Your completed levels are safe.'
            : completed === 1
              ? 'Your first board is complete.'
              : `${completed} boards complete.`}
        </p>
        {isFull && freeReviveAvailable ? (
          <>
            <button type="button" className="primary-button revive-button" onClick={revive}>
              Revive <span>Free</span>
            </button>
            <button type="button" className="ivory-button result-restart" onClick={() => dispatch({ type: 'start_board' })}>
              Restart
            </button>
          </>
        ) : isFull ? (
          <button type="button" className="primary-button" onClick={() => dispatch({ type: 'start_board' })}>
            Restart
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={() => dispatch({ type: 'leave_game_over' })}>
            Continue
          </button>
        )}
        {isFull ? (
          <button type="button" className="text-button" onClick={() => dispatch({ type: 'leave_game_over' })}>
            Back to home
          </button>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

export function FlowRouter() {
  const screen = useGame((s) => s.flow.screen);
  const screens: Record<typeof screen, ReactNode> = {
    tos: <TermsScreen />,
    age_gate: <AgeScreen />,
    loading: <LoadingScreen />,
    tutorial_a: <TutorialMatchScreen />,
    tutorial_b: <TutorialEdgeScreen />,
    tutorial_c: <TutorialHolderScreen />,
    home: <HomeScreen />,
    gameplay: null,
    game_over: <ResultScreen />,
  };
  return screens[screen];
}
