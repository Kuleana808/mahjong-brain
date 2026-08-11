import { faceName } from '../../packages/core/src/game/tiles';
import { useGame } from '../state/store';

function shortFace(suit: string, rank: number): string {
  if (suit === 'character') return `${rank}萬`;
  if (suit === 'bamboo') return `${rank}竹`;
  if (suit === 'circle') return `${rank}●`;
  if (suit === 'wind') return ['東', '南', '西', '北'][rank - 1] ?? '風';
  if (suit === 'dragon') return ['中', '發', '白'][rank - 1] ?? '龍';
  if (suit === 'flower') return '花';
  if (suit === 'season') return '季';
  return String(rank);
}

export function Holder() {
  const board = useGame((s) => s.board);
  const holder = useGame((s) => s.holder);
  const held = holder.map((id) => board?.tiles.find((tile) => tile.id === id)).filter(Boolean);

  return (
    <div
      className={`holder holder--${holder.length}${holder.length === 3 ? ' holder--warning' : ''}${holder.length === 4 ? ' holder--full' : ''}`}
      aria-label={`Holder, ${holder.length} of 4 occupied`}
    >
      {Array.from({ length: 4 }, (_, index) => {
        const tile = held[index];
        return tile ? (
          <span key={tile.id} className={`holder__tile holder__tile--${tile.face.suit}`} aria-label={faceName(tile.face)}>
            {shortFace(tile.face.suit, tile.face.rank)}
          </span>
        ) : (
          <span key={`empty-${index}`} aria-label={`Empty slot ${index + 1}`} />
        );
      })}
    </div>
  );
}
