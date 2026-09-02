import { useLayoutEffect, useRef } from 'react';

import type { TileFace } from '../../packages/core/src/game/tiles';
import type { Palette } from '../render/palette';
import { drawFace } from '../render/tileArt';

interface TileFaceCanvasProps {
  readonly face: TileFace;
  readonly palette: Palette;
}

/**
 * The canonical tile-face renderer outside the board canvas.
 *
 * Holder tiles used to substitute shorthand text such as `3●`, which made a
 * tile visibly change identity as it moved off the board. This component uses
 * the exact same artwork function as the board instead.
 */
export function TileFaceCanvas({ face, palette }: TileFaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = 90;
    const height = 100;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    drawFace(context, face, { w: width, h: height }, palette);
  }, [face, palette]);

  return (
    <canvas
      ref={canvasRef}
      className="tile-face-canvas"
      data-face={`${face.suit}-${face.rank}`}
      aria-hidden="true"
    />
  );
}
