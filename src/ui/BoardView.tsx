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

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { freeTiles, openSides, type Tile } from '../../packages/core/src/game/board';
import { faceName } from '../../packages/core/src/game/tiles';
import { computeView, tileRect, paintOrder, type View } from '../render/geometry';
import { render, type TileMotion } from '../render/boardRenderer';
import { paletteFor } from '../render/palette';
import { useGame } from '../state/store';
import { TileFaceCanvas } from './TileFaceCanvas';

interface TileFlight {
  readonly id: number;
  readonly face: Tile['face'];
  readonly from: DOMRect;
  readonly to: DOMRect;
}

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
  const [flight, setFlight] = useState<TileFlight | null>(null);

  // Track the available box rather than reading layout during paint.
  useLayoutEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const initial = element.getBoundingClientRect();
    setBox({ w: initial.width, h: initial.height });
    const observer = new ResizeObserver(([entry]) => {
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const palette = paletteFor(settings.theme, settings.tileStyle);

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
      const presentationBoard = animateMatch && progress < 1 ? previous! : board;
      const motion = new Map<number, TileMotion>();
      if (animateMatch) {
        for (const id of removed) motion.set(id, { alpha: 1 - eased, lift: 1 + eased * 0.35 });
      }
      if (flight && presentationBoard.remaining.has(flight.id)) {
        motion.set(flight.id, { alpha: 0, lift: 1 });
      }
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

    // Paint the initial frame immediately. WKWebView can defer the first rAF
    // while the native app is moving from hidden to visible, which otherwise
    // leaves a live board with an empty canvas until the next interaction.
    paint(startedAt);
    previousBoardRef.current = board;

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [board, palette, selectedId, hint, settings.dimBlocked, settings.reduceMotion, box, flight]);

  const takeTile = useCallback((tile: Tile, source: HTMLElement) => {
    if (flight || settings.reduceMotion) {
      if (!flight) tapTile(tile.id);
      return;
    }

    const holderCount = useGame.getState().holder.length;
    const destination = document.querySelector<HTMLElement>(`.holder [data-slot-index="${Math.min(holderCount, 3)}"]`);
    if (!destination) {
      tapTile(tile.id);
      return;
    }
    setFlight({ id: tile.id, face: tile.face, from: source.getBoundingClientRect(), to: destination.getBoundingClientRect() });
  }, [flight, settings.reduceMotion, tapTile]);

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
              aria-disabled={!isFree || Boolean(flight)}
              aria-pressed={tile.id === selectedId}
              aria-describedby={hintedIds.includes(tile.id) ? 'hint-text' : undefined}
              aria-label={
                isFree
                  ? `${faceName(tile.face)}, free on the ${sides.join(' and ')}`
                  : `${faceName(tile.face)}, blocked`
              }
              onClick={(event) => takeTile(tile, event.currentTarget)}
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
      {flight ? (
        <div
          className="tile-flight"
          style={{
            left: flight.from.left,
            top: flight.from.top,
            width: flight.from.width,
            height: flight.from.height,
            '--flight-x': `${flight.to.left - flight.from.left}px`,
            '--flight-y': `${flight.to.top - flight.from.top}px`,
            '--flight-scale-x': flight.to.width / flight.from.width,
            '--flight-scale-y': flight.to.height / flight.from.height,
          } as CSSProperties}
          onAnimationEnd={() => {
            tapTile(flight.id);
            setFlight(null);
          }}
          aria-hidden="true"
        >
          <TileFaceCanvas face={flight.face} palette={palette} />
        </div>
      ) : null}
    </div>
  );
}
