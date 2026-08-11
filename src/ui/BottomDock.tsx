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
        <span className="tool-medallion__face"><Icon name="shuffle" /></span>
        <span>Shuffle</span>
      </button>
      <button type="button" className="tool-medallion" aria-label={hintPending ? 'Looking for a hint' : 'Hint'} onClick={() => void requestHint()} disabled={!playing || hintPending}>
        <span className="tool-medallion__face"><Icon name="hint" /></span>
        <span>{hintPending ? 'Looking…' : 'Hint'}</span>
      </button>
      <button type="button" className="tool-medallion" aria-label="Undo" onClick={undo} disabled={tapHistory.length === 0}>
        <span className="tool-medallion__face"><Icon name="undo" /></span>
        <span>Undo</span>
      </button>
    </nav>
  );
}
