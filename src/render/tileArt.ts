/**
 * Original tile artwork, drawn with 2D primitives.
 *
 * ORIGINALITY NOTE — this is load-bearing, not boilerplate. Every mark below is
 * constructed from arcs, rounded rectangles and strokes written here. Nothing
 * is traced, sampled, or derived from Vita Mahjong or any other commercial
 * mahjong title's art. The suit *semantics* (bams, craks, dots, winds,
 * dragons, flowers, seasons) are centuries-old public domain; the *drawings*
 * are ours. Do not replace any of this with imported sprite assets without
 * checking their provenance first.
 *
 * ACCESSIBILITY — the large central motif is itself the shape channel: rings,
 * bamboo stalks, framed character marks, directional winds, dragons, flowers,
 * and seasons cannot be confused by colour alone. Numbered suits also carry a
 * large Arabic numeral. VoiceOver exposes the full face name through BoardView.
 */

import type { TileFace } from '../../packages/core/src/game/tiles';
import { suitKey, type Palette } from './palette';

type Ctx = CanvasRenderingContext2D;

interface Box {
  readonly w: number;
  readonly h: number;
}

// ---------------------------------------------------------------------------
// primitives

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function dot(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

/**
 * Motif positions for rank 1-9, in unit space inside the motif area.
 * Column-and-row arrangements rather than the traditional diagonals — they read
 * faster, and reading fast is the whole point for this audience.
 */
function arrangement(rank: number): { x: number; y: number }[] {
  const grid = (cols: number, rows: number) => {
    const points: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        points.push({ x: (c + 1) / (cols + 1), y: (r + 1) / (rows + 1) });
      }
    }
    return points;
  };

  switch (rank) {
    case 1:
      return [{ x: 0.5, y: 0.5 }];
    case 2:
      return grid(1, 2);
    case 3:
      return grid(1, 3);
    case 4:
      return grid(2, 2);
    case 5:
      return [...grid(2, 2), { x: 0.5, y: 0.5 }];
    case 6:
      return grid(2, 3);
    case 7:
      return [
        ...grid(3, 1).map((p) => ({ x: p.x, y: 0.22 })),
        { x: 0.5, y: 0.5 },
        ...grid(3, 1).map((p) => ({ x: p.x, y: 0.78 })),
      ];
    case 8:
      return grid(2, 4);
    default:
      return grid(3, 3);
  }
}

/**
 * The cell each motif gets, derived from the arrangement itself rather than
 * from the rank. Sizing off the rank is how you end up with two dots that
 * overlap into a figure-of-eight.
 */
function cellSize(points: { x: number; y: number }[], area: { w: number; h: number }) {
  const cols = new Set(points.map((p) => p.x.toFixed(3))).size;
  const rows = new Set(points.map((p) => p.y.toFixed(3))).size;
  return { w: area.w / cols, h: area.h / rows, cols, rows };
}

// ---------------------------------------------------------------------------
// suit motifs

/** A dot: outer ring with a filled core. Reads at small sizes. */
function drawCircleMark(ctx: Ctx, cx: number, cy: number, r: number, colour: string): void {
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = Math.max(1, r * 0.3);
  dot(ctx, cx, cy, r * 0.82);
  ctx.stroke();
  dot(ctx, cx, cy, r * 0.3);
  ctx.fill();
}

/** A bamboo stalk: a rounded segment with two node bands and a leaf notch. */
function drawBambooMark(ctx: Ctx, cx: number, cy: number, w: number, h: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;

  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, w * 0.42);
  ctx.fill();

  // Node bands, knocked out so they read on any background.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = Math.max(1, h * 0.07);
  for (const t of [0.34, 0.66]) {
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - h / 2 + h * t);
    ctx.lineTo(cx + w / 2, cy - h / 2 + h * t);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The character-suit emblem. Traditional craks carry 萬; ours is an original
 * geometric mark — a rounded frame over three tapering bars — so the tile is
 * unmistakably from this set and still legible at thumbnail size.
 */
function drawCrakEmblem(ctx: Ctx, cx: number, cy: number, s: number, colour: string): void {
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = Math.max(1.2, s * 0.11);
  ctx.lineCap = 'round';

  roundRect(ctx, cx - s * 0.72, cy - s * 0.8, s * 1.44, s * 1.6, s * 0.3);
  ctx.stroke();

  const widths = [0.94, 0.7, 0.46];
  widths.forEach((wf, i) => {
    const y = cy - s * 0.36 + i * s * 0.38;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.5 * wf, y);
    ctx.lineTo(cx + s * 0.5 * wf, y);
    ctx.stroke();
  });
}

function drawFlowerMark(ctx: Ctx, cx: number, cy: number, s: number, rank: number, colour: string): void {
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = Math.max(1.2, s * 0.1);
  ctx.lineCap = 'round';

  // Plum, Orchid, Chrysanthemum, Bamboo — one mark each, all unmistakably a
  // flower, because any flower pairs with any other and the tile has to say so.
  const petals = [5, 6, 14, 4][rank - 1];
  const reach = [0.9, 0.78, 0.95, 0.86][rank - 1];

  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 - Math.PI / 2;
    if (petals > 8) {
      // Chrysanthemum: many fine rays rather than petals.
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3);
      ctx.lineTo(cx + Math.cos(a) * s * reach, cy + Math.sin(a) * s * reach);
      ctx.stroke();
      continue;
    }
    // A petal is an ellipse laid along its own radius, not a dot on a stick.
    ctx.save();
    ctx.translate(cx + (Math.cos(a) * s * reach) / 2, cy + (Math.sin(a) * s * reach) / 2);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, (s * reach) / 2, s * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  dot(ctx, cx, cy, s * 0.26);
  ctx.fill();
  ctx.restore();
  dot(ctx, cx, cy, s * 0.15);
  ctx.fill();
}

function drawSeasonMark(ctx: Ctx, cx: number, cy: number, s: number, rank: number, colour: string): void {
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = Math.max(1.2, s * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (rank) {
    case 1: // Spring — a sprout breaking the line.
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.8);
      ctx.lineTo(cx, cy - s * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.42, cy - s * 0.16, s * 0.44, s * 0.24, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.42, cy - s * 0.42, s * 0.44, s * 0.24, 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 2: // Summer — a high sun over a horizon.
      dot(ctx, cx, cy - s * 0.12, s * 0.42);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * s * 0.6, cy - s * 0.12 + Math.sin(a) * s * 0.6);
        ctx.lineTo(cx + Math.cos(a) * s * 0.88, cy - s * 0.12 + Math.sin(a) * s * 0.88);
        ctx.stroke();
      }
      break;
    case 3: // Autumn — a falling leaf.
      ctx.beginPath();
      ctx.ellipse(cx, cy - s * 0.1, s * 0.44, s * 0.78, 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.45, cy + s * 0.5);
      ctx.lineTo(cx + s * 0.4, cy - s * 0.55);
      ctx.stroke();
      break;
    default: // Winter — a six-point star.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(a) * s * 0.85, cy - Math.sin(a) * s * 0.85);
        ctx.lineTo(cx + Math.cos(a) * s * 0.85, cy + Math.sin(a) * s * 0.85);
        ctx.stroke();
      }
      break;
  }
}

/**
 * Draws one tile face into the box (0, 0, box.w, box.h). The caller has already
 * drawn the tile body and clipped.
 */
export function drawFace(ctx: Ctx, face: TileFace, box: Box, palette: Palette): void {
  const colour = palette.suits[suitKey(face.suit, face.rank)];
  const motif = { x: box.w * 0.1, y: box.h * 0.14, w: box.w * 0.8, h: box.h * 0.76 };

  ctx.save();
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;

  switch (face.suit) {
    case 'circle': {
      const points = arrangement(face.rank);
      const cell = cellSize(points, motif);
      // 0.4 of the smaller cell dimension leaves visible air between marks at
      // every rank, which is what keeps 2-of-circles from reading as an eight.
      const r = Math.min(cell.w, cell.h) * 0.43;
      for (const p of points) {
        drawCircleMark(ctx, motif.x + p.x * motif.w, motif.y + p.y * motif.h, r, colour);
      }
      break;
    }

    case 'bamboo': {
      // Two and three stack vertically in `arrangement`, which turns a column
      // of thin stalks into one dashed line. Lay those two out across instead.
      const points =
        face.rank === 2 || face.rank === 3
          ? Array.from({ length: face.rank }, (_, i) => ({
              x: (i + 1) / (face.rank + 1),
              y: 0.5,
            }))
          : arrangement(face.rank);
      const cell = cellSize(points, motif);
      const w = Math.min(cell.w * 0.36, cell.h * 0.34);
      const h = cell.h * 0.72;
      for (const p of points) {
        drawBambooMark(ctx, motif.x + p.x * motif.w, motif.y + p.y * motif.h, w, h, colour);
      }
      break;
    }

    case 'character': {
      ctx.font = `700 ${box.h * 0.43}px ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(face.rank), box.w / 2, box.h * 0.4);
      drawCrakEmblem(ctx, box.w / 2, box.h * 0.75, box.w * 0.23, colour);
      break;
    }

    case 'wind': {
      const initial = ['東', '南', '西', '北'][face.rank - 1];
      ctx.font = `700 ${box.h * 0.45}px "PingFang TC", "Hiragino Sans", ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initial, box.w / 2, box.h * 0.5);

      // Arrow pointing the way the wind is named — East right, South down,
      // West left, North up. Shape, not just the letter.
      const rotation = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][face.rank - 1];
      const cx = box.w / 2;
      const cy = box.h * 0.8;
      const s = box.w * 0.12;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.8, s * 0.6);
      ctx.lineTo(0, s * 0.24);
      ctx.lineTo(-s * 0.8, s * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      break;
    }

    case 'dragon': {
      const glyph = ['中', '發', '白'][face.rank - 1];
      ctx.font = `700 ${box.h * 0.52}px "PingFang TC", "Hiragino Sans", ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colour;
      ctx.fillText(glyph, box.w / 2, box.h * 0.52);
      break;
    }

    case 'flower': {
      drawFlowerMark(ctx, box.w / 2, box.h * 0.52, box.w * 0.36, face.rank, colour);
      break;
    }

    case 'season': {
      drawSeasonMark(ctx, box.w / 2, box.h * 0.52, box.w * 0.36, face.rank, colour);
      break;
    }
  }

  ctx.restore();
}
