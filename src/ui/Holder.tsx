import { faceName } from '../../packages/core/src/game/tiles';
import { PALETTES } from '../render/palette';
import { useGame } from '../state/store';
import { TileFaceCanvas } from './TileFaceCanvas';

export function Holder() {
  const board = useGame((s) => s.board);
  const holder = useGame((s) => s.holder);
  const theme = useGame((s) => s.settings.theme);
  const held = holder.map((id) => board?.tiles.find((tile) => tile.id === id)).filter(Boolean);
  const palette = PALETTES[theme];

  return (
    <div
      className={`holder holder--${holder.length}${holder.length === 3 ? ' holder--warning' : ''}${holder.length === 4 ? ' holder--full' : ''}`}
      aria-label={`Holder, ${holder.length} of 4 occupied`}
    >
      {Array.from({ length: 4 }, (_, index) => {
        const tile = held[index];
        return tile ? (
          <span key={tile.id} className={`holder__tile holder__tile--${tile.face.suit}`} aria-label={faceName(tile.face)}>
            <TileFaceCanvas face={tile.face} palette={palette} />
          </span>
        ) : (
          <span key={`empty-${index}`} aria-label={`Empty slot ${index + 1}`} />
        );
      })}
    </div>
  );
}
