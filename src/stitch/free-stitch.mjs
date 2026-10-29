import { cellsBetween, keyOf } from './model.mjs';
import { THREAD_COLORS } from './thread-colors.mjs';

export const FREE_THREAD = THREAD_COLORS.black;
export const FREE_THREADS = [
  { name: 'Blue', color: THREAD_COLORS.blue },
  { name: 'Yellow', color: THREAD_COLORS.yellow },
  { name: 'Red', color: THREAD_COLORS.red },
  { name: 'Green', color: THREAD_COLORS.green },
  { name: 'Purple', color: THREAD_COLORS.purple },
  { name: 'Black', color: FREE_THREAD },
];

export class FreeStitch {
  constructor(model, animations, { canPlace = () => true, resolveCell = (col, row) => [col, row] } = {}) {
    Object.assign(this, { model, animations, canPlace, resolveCell });
    this.color = FREE_THREAD;
    this.tool = 'stitch';
    this.active = false;
  }
  begin(cell, now, reduced = false) {
    this.finish();
    this.active = true;
    this.last = null;
    this.visited = new Set();
    this.strokeColor = this.color;
    this.strokeTool = this.tool;
    this.move(cell, now, reduced);
  }
  move(cell, now, reduced = false) {
    if (!this.active) return;
    for (const [col, row] of cellsBetween(this.last ?? cell, cell)) {
      const cell = this.resolveCell(col, row, this.strokeTool);
      const key = keyOf(...cell);
      if (this.visited.has(key) || !this.canPlace(col, row, this.strokeTool)) continue;
      this.visited.add(key);
      const previous = this.model.stitches.get(key);
      const removing = this.strokeTool === 'unpick';
      const color = removing ? undefined : this.strokeColor;
      if (!this.model.put(...cell, color)) continue;
      if (reduced) this.animations.delete(key);
      else {
        const current = this.animations.get(key);
        const from = removing && current?.kind === 'motif'
          ? Math.max(0, Math.min(1, (now - current.started) / current.duration)) : 1;
        this.animations.set(key, { kind: removing ? 'unpick' : 'motif', color: removing ? previous : color, from, started: now, duration: Math.max(1, 340 * from) });
      }
    }
    this.last = cell;
  }
  pause() { this.last = null; }
  finish() {
    if (this.active) this.model.commit();
    this.active = false;
    this.last = null;
  }
}
