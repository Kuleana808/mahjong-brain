import { useGame } from '../state/store';
import { Icon } from './Icon';

export function BottomDock() {
  const status = useGame((s) => s.status);
  const hintPending = useGame((s) => s.hintPending);
  const tapHistory = useGame((s) => s.tapHistory);
  const shuffleBoard = useGame((s) => s.shuffleBoard);
  const requestHint = useGame((s) => s.requestHint);
  const undo = useGame((s) => s.undo);
  const playing = status === 'playing';

  return (
    <nav className="bottom-dock" aria-label="Game tools">
      <button type="button" className="tool-medallion" aria-label="Shuffle" onClick={shuffleBoard} disabled={!playing}>
        <Icon name="shuffle" />
        <span>Shuffle</span>
      </button>
      <button type="button" className="tool-medallion" aria-label={hintPending ? 'Looking for a hint' : 'Hint'} onClick={() => void requestHint()} disabled={!playing || hintPending}>
        <Icon name="hint" />
        <span>{hintPending ? 'Looking…' : 'Hint'}</span>
      </button>
      <button type="button" className="tool-medallion" aria-label="Undo" onClick={undo} disabled={tapHistory.length === 0}>
        <Icon name="undo" />
        <span>Undo</span>
      </button>
    </nav>
  );
}
