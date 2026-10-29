export const THREADS = [
  { id: 'garnet', name: 'Garnet', color: '#982c40' },
  { id: 'rose', name: 'Old rose', color: '#c48386' },
  { id: 'ochre', name: 'Ochre', color: '#ae8a49' },
  { id: 'sage', name: 'Sage', color: '#788365' },
  { id: 'pine', name: 'Pine', color: '#404d3d' },
  { id: 'ivory', name: 'Ivory', color: '#d7cdb5' },
];
export const GRID = 22;
export const SURFACE_SPACING = 1.25;
export const surfaceSpacing = width => width <= 540 ? 1.5 : SURFACE_SPACING;
export const edgeGapStitches = width => width <= 540 ? 1 : 3;
export const keyOf = (x, y) => `${x},${y}`;
export const parseKey = key => key.split(',').map(Number);
export const DEFAULT_LAYOUT = { columns: 128, rows: 162, size: 94 };
export function readLayout(layout) {
  if (!layout || !Number.isInteger(layout.columns) || !Number.isInteger(layout.rows) || !Number.isFinite(layout.size)) return { ...DEFAULT_LAYOUT };
  if (layout.columns < 1 || layout.columns > 240 || layout.rows < 1 || layout.rows > 400 || layout.size < 40 || layout.size > 100) return { ...DEFAULT_LAYOUT };
  return { columns: layout.columns, rows: layout.rows, size: layout.size, ...(layout.mode === 'corners' ? { mode: 'corners' } : {}) };
}

// Integer Bresenham keeps quick drags continuous, including when events skip cells.
export function cellsBetween(a, b) {
  const cells = [];
  let [x, y] = a;
  const [endX, endY] = b;
  const dx = Math.abs(endX - x), sx = x < endX ? 1 : -1;
  const dy = -Math.abs(endY - y), sy = y < endY ? 1 : -1;
  let error = dx + dy;
  while (true) {
    cells.push([x, y]);
    if (x === endX && y === endY) break;
    const e2 = 2 * error;
    if (e2 >= dy) { error += dy; x += sx; }
    if (e2 <= dx) { error += dx; y += sy; }
  }
  return cells;
}

export class StitchModel {
  constructor(entries = [], layout = DEFAULT_LAYOUT) {
    this.stitches = new Map(entries);
    this.layout = readLayout(layout);
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
  }
  begin() { if (!this.pending) { this.pending = new Map(); this.pendingLayout = this.layout; } }
  put(x, y, thread) {
    const key = keyOf(x, y);
    const previous = this.stitches.get(key);
    if (previous === thread) return false;
    this.begin();
    if (!this.pending.has(key)) this.pending.set(key, previous);
    if (thread === undefined) this.stitches.delete(key);
    else this.stitches.set(key, thread);
    return true;
  }
  commit() {
    if (!this.pending) return;
    const changes = [...this.pending].map(([key, before]) => ({ key, before, after: this.stitches.get(key) }))
      .filter(change => change.before !== change.after);
    if (changes.length || JSON.stringify(this.pendingLayout) !== JSON.stringify(this.layout)) {
      this.undoStack.push({ changes, beforeLayout: this.pendingLayout, afterLayout: this.layout });
      // Keep history useful without retaining unbounded sessions in memory.
      if (this.undoStack.length > 150) this.undoStack.shift();
      this.redoStack = [];
    }
    this.pending = null;
    this.pendingLayout = null;
  }
  apply(transaction, direction) {
    const { changes } = transaction;
    for (const change of changes) {
      const value = change[direction];
      if (value === undefined) this.stitches.delete(change.key);
      else this.stitches.set(change.key, value);
    }
    this.layout = transaction[direction + 'Layout'];
  }
  undo() {
    this.commit();
    const changes = this.undoStack.pop();
    if (!changes) return false;
    this.apply(changes, 'before');
    this.redoStack.push(changes);
    return true;
  }
  redo() {
    this.commit();
    const changes = this.redoStack.pop();
    if (!changes) return false;
    this.apply(changes, 'after');
    this.undoStack.push(changes);
    return true;
  }
  replace(entries, layout = this.layout) {
    this.commit();
    this.begin();
    this.layout = readLayout(layout);
    const next = new Map(entries);
    for (const key of new Set([...this.stitches.keys(), ...next.keys()])) {
      const [x, y] = parseKey(key);
      this.put(x, y, next.get(key));
    }
    this.commit();
  }
}

