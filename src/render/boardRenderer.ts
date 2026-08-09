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
  /** Ids to draw dimmed — everything that cannot be picked up right now. */
  readonly freeIds: ReadonlySet<number>;
  readonly dimBlocked: boolean;
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
  const radius = w * 0.13;

  ctx.save();
  ctx.shadowColor = palette.tileShadow;
  // Higher layers cast further. Together with the positional shift this is what
  // makes the stack legible without any animation.
  const height = 1 + layer * 0.55 + (lifted ? 1.4 : 0);
  ctx.shadowBlur = depth * 1.1 * height;
  ctx.shadowOffsetX = depth * 0.22 * height;
  ctx.shadowOffsetY = depth * 0.5 * height;

  // Extruded body: one rounded rect covering face + sides, then the face on top.
  ctx.fillStyle = palette.tileSide;
  ctx.beginPath();
  ctx.roundRect(x, y, w + depth, h + depth, radius);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = palette.tileEdge;
  ctx.lineWidth = Math.max(0.6, w * 0.018);
  ctx.beginPath();
  ctx.roundRect(x, y, w + depth, h + depth, radius);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, palette.tileFaceTop);
  gradient.addColorStop(1, palette.tileFace);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.stroke();
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
): void {
  const inset = w * 0.05;
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2, w * 0.075);
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, w * 0.1);
  ctx.stroke();
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

  for (const tile of paintOrder(live)) {
    const rect = tileRect(tile, state.board.layoutId, view);
    const isSelected = tile.id === state.selectedId;
    const isHinted = hinted.has(tile.id);
    const isFree = state.freeIds.has(tile.id);

    ctx.save();
    if (state.dimBlocked && !isFree && !isSelected && !isHinted) {
      ctx.globalAlpha = state.palette.dimAlpha;
    }

    drawTileBody(ctx, rect.x, rect.y, rect.w, rect.h, state.palette, isSelected, tile.z);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rect.w * 0.13);
    ctx.clip();
    ctx.drawImage(
      faceCanvas(tile.face, state.palette, rect.w, rect.h, dpr),
      rect.x,
      rect.y,
      rect.w,
      rect.h,
    );
    ctx.restore();

    if (isSelected) drawRing(ctx, rect.x, rect.y, rect.w, rect.h, state.palette.selected);
    else if (isHinted) drawRing(ctx, rect.x, rect.y, rect.w, rect.h, state.palette.hinted);

    ctx.restore();
  }

  return view;
}

/** Called on theme change — cached faces carry the old palette's ink. */
export function clearFaceCache(): void {
  faceCache.clear();
}
