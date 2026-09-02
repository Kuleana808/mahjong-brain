/**
 * Paint the first canvas frame synchronously.
 *
 * WKWebView and browsers pause requestAnimationFrame while hidden. Making the
 * first frame depend on rAF leaves a restored or background-loaded board blank
 * even though its interaction layer is live. Animation frames may schedule
 * themselves after this call, but the initial render must happen now.
 */
export function paintInitialFrame(paint: (now: number) => void, startedAt: number): void {
  paint(startedAt);
}
