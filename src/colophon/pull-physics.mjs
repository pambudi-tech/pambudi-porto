// The homepage's one hidden extra: pulled down past its top, the page drops
// like rubber and shows the colophon above it (colophon-pull.mjs). These are the
// pure numbers behind that pull, kept apart so they can be tested.

export const PULL = Object.freeze({
  // How hard the page resists: the iOS rubber-band constant.
  resistance: .55,
  // A touch owns the pull once it has travelled this far, mostly downward.
  commit: 12,
  // Starting on the paper, only a flick pulls (px/ms); a slower drag still
  // tilts the sheet, as it always has.
  paperFlick: .6,
  // It is meant to be found, not stumbled on: the page has to be let go
  // this far down (a share of the screen), a finger dragged most of the way
  // down a phone. How fast it was let go never counts. Any shorter pull only
  // shows the colophon's edge, and the page rises back.
  openShare: .29,
  // Or most of the colophon itself, where it is shorter than that.
  openOfPanel: .85,
  // The wheel and trackpad pull this much less than a finger for the same
  // distance: a long, sustained scroll up, not an everyday one.
  wheelScale: .4,
  // The pull ends once the wheel has been still this long.
  wheelRest: 140,
  // The colophon takes at most this share of the screen; the page stays in sight below it.
  maxShare: .82,
  // The spring that carries the page out and back, the same both ways.
  stiffness: 320,
  // The red's edge is pulled as cloth is, held at one point: it dips under
  // the finger (or the mouse, on a computer), this share deeper than the
  // page has dropped, never more than this share of the screen: a slight
  // sag, not a drop.
  dip: .12,
  dipMax: .04,
  // How wide the dip spreads: a share of the screen's width, within these px.
  dipSpread: .28,
  dipSpreadMin: 90,
  dipSpreadMax: 260,
  // Let go, the dip eases out flat at once: no spring, so it never wobbles,
  // never passes flat, never dips again. Each ms it keeps e^(-1/dipFade) of
  // its depth: three quarters gone in one frame, flat in about 50 ms.
  dipFade: 12,
});

// How far the page drops for a pull of `distance` px, against a screen `size` px tall:
// it follows the finger at first and gives less and less the further it goes.
export function rubberBand(distance, size) {
  if (distance <= 0 || size <= 0) return 0;
  return (1 - 1 / (distance * PULL.resistance / size + 1)) * size;
}

// The pull a lift came from: rubberBand's inverse, so a pull can pick up
// where a spring left the page.
export function pullFor(lift, size) {
  if (lift <= 0 || size <= 0) return 0;
  const share = Math.min(lift / size, .999);
  return size * (1 / (1 - share) - 1) / PULL.resistance;
}

// Whether a pull let go with the page `lift` px down opens the colophon,
// `height` px tall, on a screen `size` px tall.
export function opensAt(lift, size, height = Infinity) {
  return lift > 0 && lift >= Math.min(size * PULL.openShare, height * PULL.openOfPanel);
}

// Whether a touch that moved (dx, dy) from where it went down (dy > 0 is
// down) in `elapsed` ms is a pull. On the paper it must be a flick.
export function isPull(dx, dy, elapsed, { onPaper = false } = {}) {
  if (dy < PULL.commit || dy < Math.abs(dx) * 1.5) return false;
  return !onPaper || dy / Math.max(elapsed, 1) >= PULL.paperFlick;
}

// One step of a critically damped spring toward `target`: no overshoot past
// it, so the page never rises past where it rests. Velocities are px/ms.
export function springStep(position, velocity, target, elapsed) {
  const omega = Math.sqrt(PULL.stiffness) / 1000;
  const t = Math.min(elapsed, 64);
  const offset = position - target;
  const k = velocity + omega * offset;
  const decay = Math.exp(-omega * t);
  const next = target + (offset + k * t) * decay;
  const nextVelocity = (velocity - omega * k * t) * decay;
  return { position: next, velocity: nextVelocity };
}

// Settled: close enough and slow enough to stop drawing.
export const springSettled = (position, velocity, target) => Math.abs(position - target) < .5 && Math.abs(velocity) < .02;

// How deep the red dips under the finger, in px, for the page dropped `lift`
// px on a screen `size` px tall.
export function dipDepth(lift, size) {
  return Math.max(0, Math.min(lift * PULL.dip, size * PULL.dipMax));
}

// How far either side of the finger the dip reaches, in px, on a screen
// `width` px wide.
export function dipSpread(width) {
  return Math.max(PULL.dipSpreadMin, Math.min(width * PULL.dipSpread, PULL.dipSpreadMax));
}

// The edge's shape: its depth at `x`, for a dip `depth` px deep at `center`.
export function dipAt(x, depth, center, spread) {
  return depth * Math.exp(-(((x - center) / spread) ** 2));
}

// The dip `elapsed` ms further on its way out: smaller every frame, straight
// down to flat, never past it. A long frame counts as at most 64 ms. Under a
// quarter px it is flat (as setDip draws it), and reads 0.
export function dipFade(depth, elapsed) {
  const next = Math.max(0, depth) * Math.exp(-Math.min(elapsed, 64) / PULL.dipFade);
  return next < .25 ? 0 : next;
}

// The red below the colophon's flat edge, as an SVG path: from `top` px above
// that edge down to the dip, across a screen `width` px wide, a point every
// `step` px. A dip at or above the edge (as it passes flat) draws flat.
export function dipPath(width, depth, center, spread, { top = -10, step = 6 } = {}) {
  const shown = Math.max(0, depth);
  const points = [];
  for (let x = 0; x < width + step; x += step) {
    const px = Math.min(x, width);
    points.push(`${px},${dipAt(px, shown, center, spread).toFixed(1)}`);
  }
  return `M0,${top}L${points.join('L')}L${width},${top}Z`;
}
