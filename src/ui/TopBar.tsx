/**
 * The only chrome in the game.
 *
 * Three things in the reference positions: back, tile count, and settings.
 * Retention and monetization surfaces live in explicit sheets rather than
 * interrupting the board or shifting its geometry.
 */

import { useGame } from '../state/store';
import { Icon } from './Icon';

export function TopBar() {
  const board = useGame((s) => s.board);
  const dispatchFlow = useGame((s) => s.dispatchFlow);
  const openSettings = useGame((s) => s.openSettings);

  const remaining = board?.remaining.size ?? 0;

  return (
    <header className="topbar">
      <button type="button" className="iconbutton iconbutton--round" aria-label="Back to home" onClick={() => dispatchFlow({ type: 'leave_board' })}>
        <Icon name="back" size={26} />
      </button>
      <span className="topbar__count">
        {remaining} {remaining === 1 ? 'tile' : 'tiles'} left
      </span>
      <button type="button" className="iconbutton iconbutton--round" aria-label="Settings" onClick={() => openSettings(true)}>
        <Icon name="menu" size={27} />
      </button>
    </header>
  );
}
