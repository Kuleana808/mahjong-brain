/**
 * The space under the board.
 *
 * Holds the hint when there is one, and the way out when the board is stuck.
 * Floats above the tools so the board never jumps or shrinks when guidance
 * appears — a board that moves under your finger is not calm.
 */

import { useEffect } from 'react';

import { canReshuffle } from '../../packages/core/src/game/deal';
import { useGame } from '../state/store';

export function HintBar() {
  const board = useGame((s) => s.board);
  const hint = useGame((s) => s.hint);
  const status = useGame((s) => s.status);
  const announcement = useGame((s) => s.announcement);
  const dismissAnnouncement = useGame((s) => s.dismissAnnouncement);
  const dismissHint = useGame((s) => s.dismissHint);
  const shuffleBoard = useGame((s) => s.shuffleBoard);
  const newBoard = useGame((s) => s.newBoard);
  const blocked = announcement.startsWith('That tile is blocked.');

  useEffect(() => {
    if (!blocked) return;
    const qaHold = document.documentElement.dataset.qaFixtureReady ? 5000 : 1400;
    const timeout = window.setTimeout(dismissAnnouncement, qaHold);
    return () => window.clearTimeout(timeout);
  }, [blocked, dismissAnnouncement]);

  if (blocked) {
    return (
      <div className="hintbar" aria-hidden="true">
        <div className="hint hint--brief">Blocked — choose a tile with an open side.</div>
      </div>
    );
  }

  if (status === 'stuck' && board) {
    // A shuffle moves faces, never positions. If the last tiles are stacked,
    // no arrangement frees them — offering "Shuffle" there would be a lie.
    const shufflable = canReshuffle(board);

    return (
      <div className="hintbar">
        <div className="hint">
          <p style={{ margin: 0 }}>
            {shufflable
              ? 'No pairs left to take. A shuffle keeps the same tiles.'
              : 'These last tiles are stacked, so nothing can free them. Nothing you did wrong.'}
          </p>
          <button
            type="button"
            className="hint__dismiss"
            onClick={shufflable ? shuffleBoard : () => newBoard()}
          >
            {shufflable ? 'Shuffle' : 'New board'}
          </button>
        </div>
      </div>
    );
  }

  if (!hint) return null;

  return (
    <div className="hintbar">
      <div className="hint">
        <p id="hint-text" style={{ margin: 0 }}>
          {hint.summary}
        </p>
        <button type="button" className="hint__dismiss" onClick={dismissHint}>
          Got it
        </button>
      </div>
    </div>
  );
}
