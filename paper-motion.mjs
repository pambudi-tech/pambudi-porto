export const PAPER_MOTION = Object.freeze({ tiltX: 5.5, tiltY: 7, hoverScale: 1.018, pressScale: .98, responseMs: 90 });

export function paperTarget({ x = 0, y = 0, hovered = false, pressed = false, reduced = false } = {}) {
  x = Math.max(-1, Math.min(1, x));
  y = Math.max(-1, Math.min(1, y));
  const material = { lx: !reduced && hovered ? x : 0, ly: !reduced && hovered ? y : 0, light: !reduced && hovered ? 1 : 0 };
  if (pressed) return { rx: 0, ry: 0, scale: reduced ? 1 : PAPER_MOTION.pressScale, sx: 0, sy: .5, blur: 2, opacity: .02, lx: 0, ly: 0, light: reduced ? 0 : .18 };
  if (hovered) return { rx: reduced ? 0 : -y * PAPER_MOTION.tiltX, ry: reduced ? 0 : x * PAPER_MOTION.tiltY, scale: reduced ? 1 : PAPER_MOTION.hoverScale, sx: -x * 3, sy: 7 - y * 2, blur: 18, opacity: .032, ...material };
  return { rx: 0, ry: 0, scale: 1, sx: 0, sy: 1.5, blur: 6, opacity: .016, ...material };
}

export function advancePaper(current, target, elapsed) {
  const amount = 1 - Math.exp(-Math.max(0, Math.min(50, elapsed)) / PAPER_MOTION.responseMs);
  const next = {};
  for (const key of Object.keys(target)) {
    const value = current[key] + (target[key] - current[key]) * amount;
    next[key] = Math.abs(value - target[key]) < (key === 'scale' ? .00001 : .001) ? target[key] : value;
  }
  return next;
}

export function paperContains(bounds, mask, x, y) {
  if (!bounds || !mask || bounds.width <= 0 || bounds.height <= 0) return false;
  const u = (x - bounds.left) / bounds.width, v = (y - bounds.top) / bounds.height;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  return mask.alpha[Math.floor(v * mask.height) * mask.width + Math.floor(u * mask.width)] >= 96;
}
