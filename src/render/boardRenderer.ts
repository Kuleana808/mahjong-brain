/**
 * Canvas 2D board renderer.
 *
 * WHY CANVAS AND NOT PIXI (see docs/DECISIONS.md, D-002): this board redraws on
 * interaction, not on a frame loop. There are ~144 static quads, no particles,
 * no shaders, and the design brief forbids motion beyond a tile lift. PixiJS
 * would add roughly 130 KB gzipped and a WebGL context to do a job that
 * `drawImage` already does in under a millisecond. Revisit only if a future
 * feature actually needs per-frame animation.
 *
 * Faces are rasterised once per (face, theme, size) into an offscreen cache, so
 * a redraw is 144 `drawImage` calls.
 */

import type { BoardState, Tile } from '../../packages/core/src/game/board';
import type { TileFace } from '../../packages/core/src/game/tiles';
import { computeView, paintOrder, SIDE_DEPTH, tileRect, type View } from './geometry';
import type { Palette } from './palette';
import { drawFace } from './tileArt';

export interface RenderState {
  readonly board: BoardState;
  readonly palette: Palette;
  readonly selectedId: number | null;
  readonly hintedIds: readonly number[];
  /** 0..1 pulse phase for the precise, canvas-painted hint treatment. */
  readonly hintPulse?: number;
  /** Ids to draw dimmed — everything that cannot be picked up right now. */
  readonly freeIds: ReadonlySet<number>;
  readonly dimBlocked: boolean;
  /** Per-tile presentation used only during the short interaction animations. */
  readonly motion?: ReadonlyMap<number, TileMotion>;
}

export interface TileMotion {
  readonly alpha?: number;
  /** 0 = resting, 1 = fully lifted. */
  readonly lift?: number;
  /** 1 = resting size; values below 1 settle the tile into or out of view. */
  readonly scale?: number;
}

const faceCache = new Map<string, HTMLCanvasElement>();

function faceKey(face: TileFace, palette: Palette, w: number, h: number, dpr: number): string {
  return `${face.suit}-${face.rank}|${palette.name}|${Math.round(w)}x${Math.round(h)}@${dpr}`;
}

function faceCanvas(
  face: TileFace,
  palette: Palette,
  w: number,
  h: number,
  dpr: number,
): HTMLCanvasElement {
  const key = faceKey(face, palette, w, h, dpr);
  const cached = faceCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    drawFace(ctx, face, { w, h }, palette);
  }

  // Bound the cache: a resize sweep can otherwise leave every old size behind.
  if (faceCache.size > 200) faceCache.clear();
  faceCache.set(key, canvas);
  return canvas;
}

function drawTileBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: Palette,
  lifted: boolean,
  layer: number,
): void {
  const depth = w * SIDE_DEPTH;
  const radius = w * 0.11;

  ctx.save();
  ctx.shadowColor = palette.tileShadow;
  // Higher layers cast further. Together with the positional shift this is what
  // makes the stack legible without any animation.
  const height = 1 + layer * 0.55 + (lifted ? 1.4 : 0);
  ctx.shadowBlur = depth * 1.1 * height;
  ctx.shadowOffsetX = depth * 0.22 * height;
  ctx.shadowOffsetY = depth * 0.5 * height;

  // Rear slab. Drawing this separately from the face gives the tile actual
  // thickness instead of reading as a flat card with a drop shadow.
  const rear = ctx.createLinearGradient(x, y, x + depth, y + h + depth);
  rear.addColorStop(0, '#35B766');
  rear.addColorStop(0.38, palette.tileSide);
  rear.addColorStop(1, palette.tileEdge);
  ctx.fillStyle = rear;
  ctx.beginPath();
  ctx.roundRect(x + depth * 0.2, y + depth * 0.22, w + depth * 0.8, h + depth * 0.78, radius);
  ctx.fill();
  ctx.restore();

  // Dark lower/right seam and a warm reflected edge separate overlapping
  // tiles even when their faces are the same colour.
  ctx.strokeStyle = palette.tileEdge;
  ctx.lineWidth = Math.max(1, w * 0.025);
  ctx.beginPath();
  ctx.roundRect(x + depth * 0.2, y + depth * 0.22, w + depth * 0.8, h + depth * 0.78, radius);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, palette.tileFaceTop);
  gradient.addColorStop(0.38, palette.tileFace);
  gradient.addColorStop(0.88, palette.tileFace);
  gradient.addColorStop(1, '#E9DFC8');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();

  // Fired-ceramic bevel: light catches the top/left rim, while the lower rim
  // rolls into the honey-coloured body.
  ctx.strokeStyle = 'rgba(255, 255, 246, 0.92)';
  ctx.lineWidth = Math.max(1, w * 0.026);
  ctx.beginPath();
  ctx.roundRect(x + w * 0.018, y + w * 0.018, w - w * 0.036, h - w * 0.036, radius * 0.88);
  ctx.stroke();
  ctx.strokeStyle = palette.tileEdge;
  ctx.lineWidth = Math.max(0.75, w * 0.014);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.stroke();
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  pulse = 0.5,
): void {
  const inset = w * 0.035;
  ctx.save();
  ctx.shadowColor = colour;
  ctx.shadowBlur = w * (0.1 + pulse * 0.12);
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.68 + pulse * 0.32;
  ctx.lineWidth = Math.max(2.5, w * (0.03 + pulse * 0.016));
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, w * 0.1);
  ctx.stroke();
  ctx.restore();
}

function drawHintWash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  pulse = 0.5,
): void {
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  const washAlpha = 0.22 + pulse * 0.18;
  gradient.addColorStop(0, `rgba(203, 255, 190, ${washAlpha})`);
  gradient.addColorStop(0.58, `rgba(76, 224, 95, ${0.12 + pulse * 0.12})`);
  gradient.addColorStop(1, 'rgba(20, 132, 58, 0.08)');
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + w * 0.025, y + w * 0.025, w * 0.95, h - w * 0.05, w * 0.1);
  ctx.clip();
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.58 + pulse * 0.34;
  ctx.shadowColor = colour;
  ctx.shadowBlur = w * (0.06 + pulse * 0.1);
  ctx.lineWidth = Math.max(2, w * (0.022 + pulse * 0.012));
  ctx.stroke();
  ctx.restore();
}

/**
 * Fired ceramic glaze with a broad face bloom, narrow rim reflection, and a
 * soft lower falloff. It is glossy enough to read as a physical tile without
 * putting mirror glare over the symbols.
 */
function drawCeramicGlaze(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const radius = w * 0.11;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();

  const sheen = ctx.createLinearGradient(x, y, x + w * 0.72, y + h * 0.62);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
  sheen.addColorStop(0.18, 'rgba(255, 255, 255, 0.24)');
  sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0.025)');
  sheen.addColorStop(0.78, 'rgba(123, 86, 38, 0.025)');
  sheen.addColorStop(1, 'rgba(86, 55, 20, 0.14)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h);

  const bloom = ctx.createRadialGradient(x + w * 0.28, y + h * 0.18, 0, x + w * 0.28, y + h * 0.18, w * 0.72);
  bloom.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  bloom.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.76)';
  ctx.lineWidth = Math.max(1, w * 0.022);
  ctx.beginPath();
  ctx.moveTo(x + radius, y + ctx.lineWidth);
  ctx.lineTo(x + w - radius, y + ctx.lineWidth);
  ctx.stroke();
  ctx.restore();
}

/**
 * Free tiles get a restrained material glint, not a coloured selection ring.
 * This makes the next action feel inviting while keeping amber reserved for an
 * actual choice and preserving the ivory face as the visual hero.
 */
function drawFreeTileGlint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const radius = w * 0.11;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();

  const glint = ctx.createLinearGradient(x, y, x + w * 0.52, y + h * 0.2);
  glint.addColorStop(0, 'rgba(255, 255, 246, 0.42)');
  glint.addColorStop(0.38, 'rgba(255, 224, 156, 0.13)');
  glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.strokeStyle = glint;
  ctx.lineWidth = Math.max(1.2, w * 0.028);
  ctx.beginPath();
  ctx.moveTo(x + radius * 0.72, y + ctx.lineWidth);
  ctx.lineTo(x + w * 0.72, y + ctx.lineWidth);
  ctx.stroke();

  // The jade edge is the persistent affordance: available tiles are vivid and
  // tactile, while blocked tiles recede. It keeps colour off the face artwork.
  ctx.strokeStyle = 'rgba(31, 190, 87, 0.72)';
  ctx.lineWidth = Math.max(1, w * 0.018);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.18, y + h - ctx.lineWidth);
  ctx.lineTo(x + w - radius * 0.58, y + h - ctx.lineWidth);
  ctx.quadraticCurveTo(x + w - ctx.lineWidth, y + h - ctx.lineWidth, x + w - ctx.lineWidth, y + h - radius * 0.58);
  ctx.stroke();
  ctx.restore();
}

export function render(canvas: HTMLCanvasElement, state: RenderState): View {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const boxW = canvas.clientWidth;
  const boxH = canvas.clientHeight;

  if (canvas.width !== Math.round(boxW * dpr) || canvas.height !== Math.round(boxH * dpr)) {
    canvas.width = Math.round(boxW * dpr);
    canvas.height = Math.round(boxH * dpr);
  }

  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, boxW, boxH);

  const view = computeView(state.board.layoutId, boxW, boxH);
  const live: Tile[] = state.board.tiles.filter((t) => state.board.remaining.has(t.id));
  const hinted = new Set(state.hintedIds);

  // A hinted tile is temporarily lifted to the top of the visual stack. This
  // reveals the actual face instead of drawing a detached rectangle over tiles
  // that would normally overlap it.
  const ordered = paintOrder(live);
  const drawOrder = [
    ...ordered.filter((tile) => !hinted.has(tile.id)),
    ...ordered.filter((tile) => hinted.has(tile.id)),
  ];

  for (const tile of drawOrder) {
    const rect = tileRect(tile, state.board.layoutId, view);
    const isSelected = tile.id === state.selectedId;
    const isHinted = hinted.has(tile.id);
    const isFree = state.freeIds.has(tile.id);

    const motion = state.motion?.get(tile.id);
    // Free tiles sit a fraction above the stack. This small physical cue makes
    // the available moves read before the player has to hunt for them, while a
    // selected tile still gets the full lift and amber ring.
    const hintPulse = state.hintPulse ?? 0.5;
    const lift = motion?.lift ?? (isSelected ? 1 : isHinted ? 0.32 + hintPulse * 0.16 : isFree ? 0.13 : 0);
    const liftY = rect.w * 0.075 * lift;
    const scale = motion?.scale ?? (isHinted ? 1.008 + hintPulse * 0.018 : 1);
    const drawW = rect.w * scale;
    const drawH = rect.h * scale;
    const drawX = rect.x + (rect.w - drawW) / 2;
    const drawY = rect.y - liftY + (rect.h - drawH) / 2;

    ctx.save();
    ctx.globalAlpha *= motion?.alpha ?? 1;
    if (state.dimBlocked && !isFree && !isSelected && !isHinted) {
    ctx.globalAlpha *= state.palette.dimAlpha;
      // Keep blocked tiles materially present in the stack. Availability is a
      // hierarchy cue, not a disabled-screen treatment: the ivory body and
      // suit colours remain recognisable while free tiles stay unmistakable.
      ctx.filter = 'saturate(84%) brightness(92%)';
    }

    drawTileBody(ctx, drawX, drawY, drawW, drawH, state.palette, lift > 0, tile.z);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(drawX, drawY, drawW, drawH, drawW * 0.13);
    ctx.clip();
    // A tiny pressed-ink shadow gives the symbols the depth of paint sitting
    // in a shallow engraving, rather than SVG art floating over a card.
    ctx.shadowColor = 'rgba(68, 42, 15, 0.34)';
    ctx.shadowBlur = Math.max(0.5, rect.w * 0.012);
    ctx.shadowOffsetY = Math.max(0.5, rect.w * 0.012);
    ctx.drawImage(
      faceCanvas(tile.face, state.palette, rect.w, rect.h, dpr),
      drawX,
      drawY,
      drawW,
      drawH,
    );
    ctx.restore();
    drawCeramicGlaze(ctx, drawX, drawY, drawW, drawH);
    if (isHinted) drawHintWash(ctx, drawX, drawY, drawW, drawH, state.palette.hinted, state.hintPulse);
    if (isFree && !isSelected && !isHinted) {
      drawFreeTileGlint(ctx, drawX, drawY, drawW, drawH);
    }

    if (isSelected) drawRing(ctx, drawX, drawY, drawW, drawH, state.palette.selected);
    else if (isHinted) drawRing(ctx, drawX, drawY, drawW, drawH, state.palette.hinted, state.hintPulse);

    ctx.restore();
  }

  return view;
}

/** Called on theme change — cached faces carry the old palette's ink. */
export function clearFaceCache(): void {
  faceCache.clear();
}
