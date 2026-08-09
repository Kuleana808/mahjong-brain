/**
 * The board.
 *
 * Two layers that must stay in lockstep: a canvas that draws, and a grid of
 * transparent buttons that handles every interaction. The buttons are what make
 * the board reachable by keyboard and legible to VoiceOver — a bare canvas is
 * a black box to both — and they get exact hit-testing for free.
 *
 * Keyboard model: only free tiles are in the tab order, and the arrow keys move
 * between them by direction. Tabbing through 144 tiles would not be an
 * accessible board, just a technically-focusable one.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { freeTiles, openSides, type Tile } from '../../packages/core/src/game/board';
import { faceName } from '../../packages/core/src/game/tiles';
import { computeView, tileRect, paintOrder, type View } from '../render/geometry';
import { render, type TileMotion } from '../render/boardRenderer';
import { PALETTES } from '../render/palette';
import { useGame } from '../state/store';

export function BoardView() {
  const board = useGame((s) => s.board);
  const selectedId = useGame((s) => s.selectedId);
  const hint = useGame((s) => s.hint);
  const settings = useGame((s) => s.settings);
  const tapTile = useGame((s) => s.tapTile);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousBoardRef = useRef(board);
  const animationRef = useRef<number | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Track the available box rather than reading layout during paint.
  useLayoutEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const palette = PALETTES[settings.theme];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !board || box.w === 0 || box.h === 0) return;

    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);

    const previous = previousBoardRef.current;
    const removed =
      previous && previous.seed === board.seed
        ? [...previous.remaining].filter((id) => !board.remaining.has(id))
        : [];
    const animateMatch = !settings.reduceMotion && removed.length === 2;
    const startedAt = performance.now();
    const duration = 180;

    const paint = (now: number) => {
      const progress = animateMatch ? Math.min(1, (now - startedAt) / duration) : 1;
      const eased = 1 - Math.pow(1 - progress, 3);
      const motion = new Map<number, TileMotion>();
      if (animateMatch) {
        for (const id of removed) motion.set(id, { alpha: 1 - eased, lift: 1 + eased * 0.35 });
      }

      const presentationBoard = animateMatch && progress < 1 ? previous! : board;
      const nextView = render(canvas, {
        board: presentationBoard,
        palette,
        selectedId,
        hintedIds: hint ? [hint.pair[0].id, hint.pair[1].id] : [],
        freeIds: new Set(freeTiles(board).map((t) => t.id)),
        dimBlocked: settings.dimBlocked,
        motion,
      });
      setView(nextView);

      if (animateMatch && progress < 1) animationRef.current = requestAnimationFrame(paint);
      else animationRef.current = null;
    };

    animationRef.current = requestAnimationFrame(paint);
    previousBoardRef.current = board;

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [board, palette, selectedId, hint, settings.dimBlocked, settings.reduceMotion, box]);

  const moveFocus = useCallback(
    (from: Tile, direction: 'up' | 'down' | 'left' | 'right') => {
      if (!board || !view) return;
      const candidates = freeTiles(board).filter((t) => t.id !== from.id);
      if (candidates.length === 0) return;

      const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
      const sign = direction === 'right' || direction === 'down' ? 1 : -1;

      const ahead = candidates.filter((t) => (t[axis] - from[axis]) * sign > 0);
      const pool = ahead.length > 0 ? ahead : candidates;

      const nearest = pool.reduce((best, t) => {
        const distance = (c: Tile) =>
          Math.abs(c[axis] - from[axis]) * 1 + Math.abs(c[axis === 'x' ? 'y' : 'x'] - from[axis === 'x' ? 'y' : 'x']) * 2;
        return distance(t) < distance(best) ? t : best;
      });

      document.getElementById(`tile-${nearest.id}`)?.focus();
    },
    [board, view],
  );

  if (!board) return <div className="board" ref={wrapRef} />;

  const live = board.tiles.filter((t) => board.remaining.has(t.id));
  const free = new Set(freeTiles(board).map((t) => t.id));
  const hintedIds = hint ? [hint.pair[0].id, hint.pair[1].id] : [];
  const activeView = view ?? computeView(board.layoutId, box.w || 1, box.h || 1);

  return (
    <div className="board" ref={wrapRef}>
      <canvas ref={canvasRef} className="board__canvas" aria-hidden="true" />

      <div role="grid" aria-label={`Mahjong board, ${live.length} tiles remaining`}>
        {paintOrder(live).map((tile) => {
          const rect = tileRect(tile, board.layoutId, activeView);
          const isFree = free.has(tile.id);
          const sides = isFree ? openSides(tile, live) : [];

          return (
            <button
              key={tile.id}
              id={`tile-${tile.id}`}
              type="button"
              className="board__hit"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
              tabIndex={isFree ? 0 : -1}
              aria-disabled={!isFree}
              aria-pressed={tile.id === selectedId}
              aria-describedby={hintedIds.includes(tile.id) ? 'hint-text' : undefined}
              aria-label={
                isFree
                  ? `${faceName(tile.face)}, free on the ${sides.join(' and ')}`
                  : `${faceName(tile.face)}, blocked`
              }
              onClick={() => tapTile(tile.id)}
              onKeyDown={(event) => {
                const map = {
                  ArrowUp: 'up',
                  ArrowDown: 'down',
                  ArrowLeft: 'left',
                  ArrowRight: 'right',
                } as const;
                const direction = map[event.key as keyof typeof map];
                if (direction) {
                  event.preventDefault();
                  moveFocus(tile, direction);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
