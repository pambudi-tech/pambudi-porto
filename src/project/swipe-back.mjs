// A swipe to the right on the project goes back to the works, by the same
// flight as its "back" link. The screen's very edge is the browser's own
// back swipe (project-transition.mjs lands that one without a flight), so
// this one starts clear of it.
export const SWIPE_BACK = Object.freeze({
  edge: 24,      // px at each side left to the browser
  lock: 12,      // px the finger moves before the swipe picks a direction
  distance: 72,  // px to the right that make it a "back"
  steep: 1.5,    // how much more sideways than up or down it must go
});

// What a touch that began at `start` and is now at `point` means: 'back', a
// swipe that is not this one ('other'), or not yet known (null). `width` is
// the screen's.
export function swipeIntent(start, point, width) {
  if (start.x < SWIPE_BACK.edge || start.x > width - SWIPE_BACK.edge) return 'other';
  const dx = point.x - start.x, dy = point.y - start.y;
  if (Math.hypot(dx, dy) < SWIPE_BACK.lock) return null;
  if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * SWIPE_BACK.steep) return 'other';
  return dx >= SWIPE_BACK.distance ? 'back' : null;
}

// Listens on this page for the swipe; `back` runs once per swipe.
export function mountSwipeBack(back) {
  let start = null;
  addEventListener('touchstart', event => {
    start = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  addEventListener('touchmove', event => {
    if (!start) return;
    if (event.touches.length !== 1) { start = null; return; }
    const intent = swipeIntent(start, { x: event.touches[0].clientX, y: event.touches[0].clientY }, innerWidth);
    if (intent === null) return;
    start = null;
    if (intent === 'back') back();
  }, { passive: true });
  addEventListener('touchend', () => { start = null; }, { passive: true });
  addEventListener('touchcancel', () => { start = null; }, { passive: true });
}
