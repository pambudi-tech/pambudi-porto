import { keyOf, cellsBetween } from './model.mjs';
import { MOTIF_DATA } from './motif-data.mjs';

// These three thread palettes are intentionally brighter than the references.
const VIBRANT_PALETTES = {
  rose: ['#621326', '#9b1026', '#d51230', '#f7203f', '#ff5262', '#0e5034', '#267d37', '#3c9e35', '#70b73d', '#b0d84b'],
  watermelon: ['#111314', '#ff174b', '#ff6b91', '#008f45', '#20cf61', '#f6f3e7'],
  duck: ['#161912', '#ffdc00', '#ff8400'],
};

// Keep the traced source silhouette. Tilted charts are sampled
// onto integer surface cells so the Xs still use the cloth's actual holes.
export const MOTIFS = MOTIF_DATA.map(motif => ({
  ...motif, palette: VIBRANT_PALETTES[motif.id] ?? motif.palette,
  columns: motif.rows[0].length, lines: motif.rows.length,
}));

const noise = (x, y, seed = 0) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 43.13) * 43758.5453;
  return value - Math.floor(value);
};

export const MAX_MOTIF_ROTATION = Math.PI / 12;
export const randomMotifRotation = (random = Math.random) => (random() * 2 - 1) * MAX_MOTIF_ROTATION;

export function createMotif(id, { col = 0, row = 0, seed = 0, rotation = 0 } = {}) {
  const motif = MOTIFS.find(motif => motif.id === id);
  if (!motif) throw new RangeError(`Unknown motif: ${id}`);
  const cx = Math.floor(motif.columns / 2), cy = Math.floor(motif.lines / 2);
  const ox = Math.round(col), oy = Math.round(row);
  rotation = Math.max(-MAX_MOTIF_ROTATION, Math.min(MAX_MOTIF_ROTATION, rotation));
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const extentX = Math.ceil((Math.abs(cos) * motif.columns + Math.abs(sin) * motif.lines) / 2) + 1;
  const extentY = Math.ceil((Math.abs(sin) * motif.columns + Math.abs(cos) * motif.lines) / 2) + 1;
  const radius = Math.max(1, Math.hypot(cx, cy));
  const cells = new Map();
  const addCell = (dx, dy, x, y, color) => {
    const key = keyOf(dx, dy);
    if (cells.has(key)) return;
    const delay = Math.hypot(x - cx, y - cy) / radius * 600 + noise(x, y, seed) * 80;
    cells.set(key, { col: ox + dx, row: oy + dy, color, delay });
  };
  for (let dy = -extentY; dy <= extentY; dy++) for (let dx = -extentX; dx <= extentX; dx++) {
    const x = Math.round(dx * cos + dy * sin) + cx;
    const y = Math.round(-dx * sin + dy * cos) + cy;
    const symbol = motif.rows[y]?.[x];
    if (!symbol || symbol === '.') continue;
    const color = motif.palette[parseInt(symbol, 36)];
    addCell(dx, dy, x, y, color);
  }
  // Keep thin stems and diagonal joins connected when nearest-cell sampling
  // falls between holes. Forward samples and short bridges retain the source
  // connections without rotating or shrinking the actual cotton crosses.
  const target = (x, y) => [Math.round((x - cx) * cos - (y - cy) * sin), Math.round((x - cx) * sin + (y - cy) * cos)];
  motif.rows.forEach((line, y) => [...line].forEach((symbol, x) => {
    if (symbol === '.') return;
    const color = motif.palette[parseInt(symbol, 36)];
    const point = target(x, y);
    addCell(...point, x, y, color);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const neighbor = motif.rows[y + dy]?.[x + dx];
      if (!neighbor || neighbor === '.') continue;
      const end = target(x + dx, y + dy);
      if (Math.max(Math.abs(end[0] - point[0]), Math.abs(end[1] - point[1])) <= 1) continue;
      for (const [tx, ty] of cellsBetween(point, end).slice(1, -1)) addCell(tx, ty, x, y, color);
    }
  }));
  return [...cells.values()].sort((a, b) => a.delay - b.delay);
}

// Serve the complete collection before reshuffling; avoid immediate repeats.
export class MotifBag {
  constructor(random = Math.random) { this.random = random; this.bag = []; this.last = null; }
  next() {
    if (!this.bag.length) {
      this.bag = [...MOTIFS];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.at(-1)?.id === this.last) [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag.at(-1), this.bag[0]];
    }
    const motif = this.bag.pop();
    this.last = motif.id;
    return motif;
  }
}

// One complete motif is one undo action, including overlapping stitches.
export function stampMotif(model, id, options = {}) {
  const { started = 0, reduced = false, canPlace = () => true, onStamp } = options;
  const animations = new Map();
  model.commit();
  const previous = model.undoStack.at(-1);
  const changes = [], placed = [];
  model.begin();
  for (const cell of createMotif(id, options)) {
    if (!canPlace(cell.col, cell.row)) continue;
    const key = keyOf(cell.col, cell.row);
    changes.push({ key, before: model.stitches.get(key), after: cell.color });
    placed.push(cell);
    if (!model.put(cell.col, cell.row, cell.color)) continue;
    if (!reduced) animations.set(keyOf(cell.col, cell.row), { color: cell.color, kind: 'motif', started: started + cell.delay, duration: 280 });
  }
  model.commit();
  if (onStamp && changes.length) {
    let transaction = model.undoStack.at(-1);
    if (transaction === previous) {
      transaction = { changes, beforeLayout: model.layout, afterLayout: model.layout };
      model.undoStack.push(transaction);
      if (model.undoStack.length > 150) model.undoStack.shift();
      model.redoStack = [];
    } else transaction.changes = changes;
    onStamp(transaction, placed, started);
  }
  return animations;
}
