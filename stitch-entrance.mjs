// Shared timing for actual two-pass X geometry. Progress changes thread length;
// it never changes cell positions, opacity, saved embroidery, or undo history.
export const ENTRANCE = Object.freeze({
  delay: 140,
  stitch: 340,
  corners: 1550,
  wordmark: 2050,
});

export class StitchEntrance {
  constructor({ started = 0, sweep = ENTRANCE.corners, reduced = false } = {}) {
    this.started = started;
    this.sweep = sweep;
    this.finished = reduced;
    this.offsets = new Map();
  }
  plan(groups) {
    this.offsets.clear();
    for (const keys of groups) {
      keys.forEach((key, index) => this.offsets.set(key, ENTRANCE.delay + index / Math.max(1, keys.length - 1) * this.sweep));
    }
  }
  progress(key, now) {
    if (this.finished || !this.offsets.has(key)) return 1;
    return Math.max(0, Math.min(1, (now - this.started - this.offsets.get(key)) / ENTRANCE.stitch));
  }
  active(now) {
    return !this.finished && this.offsets.size > 0 && now < this.started + ENTRANCE.delay + this.sweep + ENTRANCE.stitch;
  }
  complete(key) { this.offsets.delete(key); }
  finish() { this.finished = true; }
}

export function wordmarkEntranceOrder(cells) {
  return [...cells].sort(([ax, ay], [bx, by]) => by - ay || (ay % 2 === 0 ? ax - bx : bx - ax)).map(([col, row]) => `${col},${row}`);
}
