/**
 * The only chrome in the game.
 *
 * Four things: how many tiles are left, a hint, an undo, and settings. No
 * score, no timer, no streak, no daily-reward badge. Nothing here counts down
 * or nags — the brief is explicit that a countdown is the opposite of calm.
 */

import { useGame } from '../state/store';

export function TopBar() {
  const board = useGame((s) => s.board);
  const hintPending = useGame((s) => s.hintPending);
  const status = useGame((s) => s.status);
  const requestHint = useGame((s) => s.requestHint);
  const undo = useGame((s) => s.undo);
  const openSettings = useGame((s) => s.openSettings);

  const remaining = board?.remaining.size ?? 0;
  const canUndo = (board?.removed.length ?? 0) > 0;

  return (
    <header className="topbar">
      <span className="topbar__count">
        {remaining} {remaining === 1 ? 'tile' : 'tiles'} left
      </span>

      <div className="topbar__actions">
        <button
          type="button"
          className="iconbutton"
          onClick={() => void requestHint()}
          disabled={hintPending || status !== 'playing'}
        >
          {hintPending ? 'Looking…' : 'Hint'}
        </button>

        <button type="button" className="iconbutton" onClick={undo} disabled={!canUndo}>
          Undo
        </button>

        <button type="button" className="iconbutton" onClick={() => openSettings(true)}>
          <span aria-hidden="true">☰</span>
          <span className="visually-hidden">Settings</span>
        </button>
      </div>
    </header>
  );
}
