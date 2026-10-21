export const PAPER_MOTION = Object.freeze({ tiltX: 1.05, tiltY: 1.35, pressScale: .997, responseMs: 95 });

export function paperTarget({ x = 0, y = 0, hovered = false, pressed = false, reduced = false } = {}) {
  x = Math.max(-1, Math.min(1, x));
  y = Math.max(-1, Math.min(1, y));
  if (pressed) return { rx: 0, ry: 0, scale: reduced ? 1 : PAPER_MOTION.pressScale, sx: 0, sy: .4, blur: .8, opacity: .035 };
  if (hovered) return { rx: reduced ? 0 : -y * PAPER_MOTION.tiltX, ry: reduced ? 0 : x * PAPER_MOTION.tiltY, scale: 1, sx: -x * 1.4, sy: 2.8 - y * .6, blur: 4.2, opacity: .055 };
  return { rx: 0, ry: 0, scale: 1, sx: 0, sy: 1, blur: 2, opacity: .035 };
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
