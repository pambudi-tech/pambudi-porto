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

const noiseHash = (x, y) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + 17.3) * 43758.5453;
  return value - Math.floor(value);
};
const smoothNoise = (x, y) => {
  const col = Math.floor(x), row = Math.floor(y);
  const sx = x - col, sy = y - row;
  const fx = sx * sx * (3 - 2 * sx), fy = sy * sy * (3 - 2 * sy);
  const a = noiseHash(col, row), b = noiseHash(col + 1, row);
  const c = noiseHash(col, row + 1), d = noiseHash(col + 1, row + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
};

export function flameEntranceOrder(cells, { origin = 'bottom' } = {}) {
  if (!cells.length) return [];
  const rows = cells.map(([, row]) => row);
  const bottom = Math.max(...rows), height = Math.max(1, bottom - Math.min(...rows));
  const left = Math.min(...cells.map(([col]) => col));
  const right = Math.max(...cells.map(([col]) => col));
  const centerX = (left + right) / 2, centerY = bottom - height / 2;
  // Coherent tongues lean as they rise. Smaller eddies leave pockets behind
  // the front, without repeating tiles or a horizontal scan across each row.
  const ranked = cells.map(([col, row]) => {
    if (origin === 'center') {
      const dx = (col - centerX) / Math.max(1, (right - left) / 2);
      const dy = (row - centerY) / Math.max(1, height / 2);
      const distance = Math.hypot(dx, dy);
      const tongues = (smoothNoise(dx * 2.4 + 4, dy * 2.4 + 8) - .5) * .36;
      const score = distance + tongues * Math.min(1, distance * 2) + noiseHash(col, row) * .035;
      return { col, row, score };
    }
    const x = col - left, y = bottom - row;
    const sway = (smoothNoise(x / (height * .7), y / (height * .5)) - .5) * height * .24;
    const broad = smoothNoise((x + sway) / (height * .48), 3.7);
    const narrow = smoothNoise((x - sway) / (height * .19), 8.2);
    const tongue = (broad * .65 + narrow * .35 - .5) * height * .95;
    const pocket = (smoothNoise(x / 3.5, y / 3) - .5) * height * .13;
    const score = y - tongue + pocket + noiseHash(col, row) * .65;
    return { col, row, score };
  });
  return ranked.sort((a, b) => a.score - b.score || b.row - a.row || a.col - b.col).map(({ col, row }) => `${col},${row}`);
}
