/**
 * The only chrome in the game.
 *
 * Back, tile count, then a quick sound toggle and settings. The mute button is
 * here rather than only in Settings because the moment a player wants sound off
 * is the moment it is bothering them, and making them open a sheet to stop it is
 * the wrong answer (Brent, 2026-09-02). It toggles the same `settings.sounds`
 * the Settings switch does, so the two can never disagree.
 *
 * Retention and monetization surfaces live in explicit sheets rather than
 * interrupting the board or shifting its geometry.
 */

import { useGame } from '../state/store';
import { Icon } from './Icon';

export function TopBar() {
  const board = useGame((s) => s.board);
  const dispatchFlow = useGame((s) => s.dispatchFlow);
  const openSettings = useGame((s) => s.openSettings);
  const sounds = useGame((s) => s.settings.sounds);
  const updateSettings = useGame((s) => s.updateSettings);

  const remaining = board?.remaining.size ?? 0;

  return (
    <header className="topbar">
      <button type="button" className="iconbutton iconbutton--round" aria-label="Back to home" onClick={() => dispatchFlow({ type: 'leave_board' })}>
        <Icon name="back" size={26} />
      </button>
      <span className="topbar__count">
        {remaining} {remaining === 1 ? 'tile' : 'tiles'} left
      </span>
      <div className="topbar__actions">
        <button
          type="button"
          className="iconbutton iconbutton--round"
          aria-label={sounds ? 'Mute sound effects' : 'Unmute sound effects'}
          aria-pressed={!sounds}
          onClick={() => updateSettings({ sounds: !sounds })}
        >
          <Icon name={sounds ? 'sound-on' : 'sound-off'} size={26} />
        </button>
        <button type="button" className="iconbutton iconbutton--round" aria-label="Settings" onClick={() => openSettings(true)}>
          <Icon name="menu" size={27} />
        </button>
      </div>
    </header>
  );
}
