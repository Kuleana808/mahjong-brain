import { describe, expect, it } from 'vitest';

import { CELL_STEP_X, CELL_STEP_Y, computeView, tileRect } from '../geometry';

describe('phone board presentation', () => {
  it('uses controlled overlap to keep the starter board tiles readable', () => {
    const view = computeView('pyramid', 393, 620);

    expect(view.tileW).toBeGreaterThanOrEqual(66);
    expect(view.tileH).toBeGreaterThan(view.tileW);
  });

  it('keeps every production layout at the phone readability floor', () => {
    for (const layout of ['pyramid', 'turtle', 'dragon'] as const) {
      expect(computeView(layout, 390, 520).tileW, layout).toBeGreaterThanOrEqual(66);
    }
  });

  it('keeps the starter silhouette tapered instead of a uniform rectangle', async () => {
    const { LAYOUTS } = await import('../../../packages/core/src/game/layouts');
    const ground = LAYOUTS.pyramid.cells.filter((cell) => cell.z === 0);
    const rowWidths = new Map<number, number>();
    for (const cell of ground) rowWidths.set(cell.y, (rowWidths.get(cell.y) ?? 0) + 1);

    expect(new Set(rowWidths.values()).size).toBeGreaterThan(1);
    expect(Math.max(...rowWidths.values())).toBe(10);
    expect(Math.min(...rowWidths.values())).toBe(6);
  });

  it('keeps the DOM hit geometry on the same visual steps as the canvas', () => {
    const view = computeView('pyramid', 393, 620);
    const first = tileRect({ x: 0, y: 0, z: 0 }, 'pyramid', view);
    const nextColumn = tileRect({ x: 1, y: 0, z: 0 }, 'pyramid', view);
    const nextRow = tileRect({ x: 0, y: 1, z: 0 }, 'pyramid', view);

    expect(nextColumn.x - first.x).toBeCloseTo(view.tileW * CELL_STEP_X);
    expect(nextRow.y - first.y).toBeCloseTo(view.tileH * CELL_STEP_Y);
  });

  it('keeps portrait iPad tiles comfortably above the tablet minimum', () => {
    const view = computeView('pyramid', 1024, 1046);
    expect(view.tileW).toBeGreaterThanOrEqual(80);
  });

  it('keeps landscape iPad tiles readable with compact gameplay chrome', () => {
    // 1024x768 minus the landscape top bar, holder, and bottom dock.
    for (const layout of ['pyramid', 'turtle', 'dragon'] as const) {
      expect(computeView(layout, 1024, 559).tileW, layout).toBeGreaterThanOrEqual(70);
    }
  });
});
