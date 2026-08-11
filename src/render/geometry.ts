/**
 * Layout units to screen pixels.
 *
 * Shared by the canvas renderer and the DOM interaction layer — they must agree
 * exactly or the buttons drift off the tiles they represent, so the transform
 * lives in one place and neither owns it.
 */

import type { Cell } from '../../packages/core/src/game/layouts';
import { LAYOUTS, type LayoutId } from '../../packages/core/src/game/layouts';

/** Tile proportions. Slightly taller than wide, as a real tile is. */
export const TILE_ASPECT = 1.32;

/**
 * How far each stacked layer shifts, as a fraction of tile size.
 *
 * This is the only cue that says "these tiles are on top of those tiles", so it
 * has to be unmistakable at a glance and on a small screen. Anything under
 * about 0.15 reads as a flat grid with some tiles oddly faded.
 */
const LAYER_SHIFT_X = 0.16;
const LAYER_SHIFT_Y = 0.16;

/**
 * Visual spacing between tiles on the same layer.
 *
 * A literal one-tile grid makes a 10-column, 144-tile board illegible on a
 * phone. Physical mahjong solitaire layouts overlap in perspective, and the
 * parity reference does the same. Keeping this in the view transform (rather
 * than the game coordinates) preserves every blocking rule while giving each
 * face a comfortably larger drawing and hit target.
 */
export const CELL_STEP_X = 0.44;
export const CELL_STEP_Y = 0.56;

/** Extruded side thickness, as a fraction of tile width. */
export const SIDE_DEPTH = 0.11;

export interface View {
  readonly tileW: number;
  readonly tileH: number;
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Fits a layout into the available box, leaving generous margins. Negative
 * space is part of the design, not slack — the board never fills the frame.
 */
export function computeView(layoutId: LayoutId, boxW: number, boxH: number): View {
  const { bounds, maxZ } = LAYOUTS[layoutId];
  const cols = bounds.maxX - bounds.minX;
  const rows = bounds.maxY - bounds.minY;

  // Extra room for the layer shift and the extruded sides.
  const spanCols = 1 + (cols - 1) * CELL_STEP_X + maxZ * LAYER_SHIFT_X + SIDE_DEPTH;
  const spanRows = 1 + (rows - 1) * CELL_STEP_Y + maxZ * LAYER_SHIFT_Y + SIDE_DEPTH * TILE_ASPECT;

  const margin = 0.97;
  const tileW = Math.min((boxW * margin) / spanCols, (boxH * margin) / (spanRows * TILE_ASPECT));
  const tileH = tileW * TILE_ASPECT;

  const width = spanCols * tileW;
  const height = spanRows * tileH;

  return {
    tileW,
    tileH,
    // Centre the board, then push right/down to leave room for the shift.
    originX: (boxW - width) / 2 + SIDE_DEPTH * tileW,
    originY: (boxH - height) / 2 + maxZ * LAYER_SHIFT_Y * tileH,
    width: boxW,
    height: boxH,
  };
}

export function tileRect(cell: Cell, layoutId: LayoutId, view: View): Rect {
  const { bounds } = LAYOUTS[layoutId];
  return {
    x:
      view.originX +
      ((cell.x - bounds.minX) * CELL_STEP_X + cell.z * LAYER_SHIFT_X) * view.tileW,
    y:
      view.originY +
      ((cell.y - bounds.minY) * CELL_STEP_Y - cell.z * LAYER_SHIFT_Y) * view.tileH,
    w: view.tileW,
    h: view.tileH,
  };
}

/**
 * Painter's order: lower layers first, then back to front within a layer, so
 * the extruded sides and the layer shift both stack correctly.
 */
export function paintOrder<T extends Cell>(cells: readonly T[]): T[] {
  return cells.slice().sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}
