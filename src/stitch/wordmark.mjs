import { GRID } from './model.mjs';
import { coverageTable, traceWordmark, WORDMARK_RATIO } from './wordmark-grid.mjs';
import { StitchEntrance, ENTRANCE, flameEntranceOrder } from './stitch-entrance.mjs';
import { drawActiveDots, ORNAMENT_COLOR } from './dot-matrix.mjs';
import { StitchUnpick } from './stitch-unpick.mjs';
import { isPhone } from '../shared/breakpoints.mjs';

// The wordmark's canvas is repainted in tiles this many pixels square.
const TILE = 32;

export class StitchWordmark {
  constructor(canvas, sprite, { requestFrame, motionPreference, entranceStarted } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.sprite = sprite;
    this.requestFrame = requestFrame;
    this.motionPreference = motionPreference;
    this.entranceStarted = entranceStarted;
    // A canvas the browser had to clear is painted whole on its next paint.
    canvas.addEventListener?.('contextrestored', () => { this.shown = null; });
    this.ready = this.load().catch(error => console.error('Wordmark tracing:', error));
  }
  async load() {
    const image = new Image();
    image.src = '/assets/wordmark-source.webp';
    await image.decode();
    const source = document.createElement('canvas');
    source.width = 1024; source.height = Math.round(1024 * WORDMARK_RATIO);
    const context = source.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, source.width, source.height);
    this.sourceWidth = source.width; this.sourceHeight = source.height;
    this.table = coverageTable(context.getImageData(0, 0, source.width, source.height).data, source.width, source.height);
    this.draw();
  }
  resize(width, view) {
    this.width = width; this.view = { ...view };
    this.draw();
  }
  draw() {
    if (!this.table || !this.view) return;
    const { width, view, canvas } = this;
    const pitch = GRID * view.scale;
    this.isDots = isPhone(width);
    const options = this.isDots ? { startRow: Math.ceil(-view.y / pitch) + 1 } : {};
    const { cells, height, bottomRow } = traceWordmark(this.table, this.sourceWidth, this.sourceHeight, width, view, pitch, options);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.ceil((this.isDots ? view.y + bottomRow * pitch : height) * dpr);
    this.cells = cells;
    // Each cell's key and thread variation, for the paint every frame.
    this.cellKeys = cells.map(([col, row]) => `${col},${row}`);
    this.variations = cells.map(([col, row]) => ((col * 17 + row * 31) % 8 + 8) % 8);
    this.dpr = dpr;
    if (!this.isDots) this.planTiles();
    // The canvas was cleared by its new size: nothing on it yet.
    this.shown = null;
    this.entrance ??= new StitchEntrance({ started: this.entranceStarted ?? performance.now(), sweep: ENTRANCE.wordmark, reduced: this.motionPreference?.matches });
    this.entrance.plan([flameEntranceOrder(cells)]);
    this.paint(performance.now());
    canvas.dataset.stitches = String(cells.length);
    canvas.setAttribute('aria-label', this.isDots ? 'Pambudi, formed from enlarged surface dots' : 'Pambudi, embroidered in white cross-stitch');
    canvas.dataset.layout = this.isDots ? 'artwork-dots' : 'single-line';
    if (this.isDots) canvas.dataset.dots = String(cells.length);
    canvas.dataset.reveal = 'flame';
    canvas.dataset.ready = 'true';
    if (this.animating) this.requestFrame?.();
  }
  paint(now) {
    const { canvas, context, view, dpr } = this;
    if (this.isDots) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawActiveDots(context, this.cells, view, (col, row) => this.progress(`${col},${row}`, now), '#d6d6d6');
    } else this.paintStitches(now);
    this.animating = this.entrance.active(now) || Boolean(this.departure?.active(now));
    // Written only when they change: paint runs every frame of the entrance.
    write(canvas, 'entrance', this.animating ? 'stitching' : 'complete');
    if (this.departure) write(canvas, 'departure', this.departure.active(now) ? 'unpick' : 'complete');
  }
  // Each frame of the entrance moves only some stitches on a step, and the
  // dove covers only a few holes: only the tiles of the canvas those touch
  // are sewn again, with every stitch reaching into them drawn in its usual
  // order, so each pixel comes out as a whole repaint would make it. Tiles
  // nothing changed in keep what they show.
  paintStitches(now) {
    const { canvas, context, view, dpr, cells, cellKeys, variations } = this;
    const count = cells.length, next = this.next, shown = this.shown;
    // The sprite each stitch shows now, fetched as a whole repaint does.
    for (let i = 0; i < count; i++) {
      const progress = this.progress(cellKeys[i], now);
      next[i] = progress <= 0 ? null : this.sprite(ORNAMENT_COLOR, variations[i], progress);
    }
    const { tiles, across, tileOf } = this;
    let dirty = 0;
    if (shown) {
      tiles.fill(0);
      for (let i = 0; i < count; i++) {
        if (next[i] === shown[i]) continue;
        for (let y = tileOf[i * 4 + 1]; y <= tileOf[i * 4 + 3]; y++) {
          for (let x = tileOf[i * 4]; x <= tileOf[i * 4 + 2]; x++) dirty += tiles[y * across + x] ? 0 : (tiles[y * across + x] = 1);
        }
      }
      if (!dirty) return;
    }
    const world = [dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y];
    if (!shown || dirty > tiles.length / 2) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(...world);
      for (let i = 0; i < count; i++) {
        if (!next[i]) continue;
        const [col, row] = cells[i];
        context.drawImage(next[i], col * GRID - 5, row * GRID - 5, GRID + 10, GRID + 10);
      }
    } else {
      // The tiles are sewn on a spare canvas of the same size, unclipped,
      // with every stitch reaching into them in its usual order, then copied
      // across pixel for pixel. No clip is involved: a GPU trims sprites at
      // a clip's edge and samples them a hair differently there.
      const { width, height } = canvas, spare = this.spare;
      if (spare.canvas.width !== width || spare.canvas.height !== height) Object.assign(spare.canvas, { width, height });
      const runs = this.runs;
      runs.length = 0;
      for (let y = 0; y * across < tiles.length; y++) {
        for (let x = 0; x < across; x++) {
          if (!tiles[y * across + x]) continue;
          const start = x;
          while (x + 1 < across && tiles[y * across + x + 1]) x++;
          runs.push(start * TILE, y * TILE, Math.min(width, (x + 1) * TILE) - start * TILE, Math.min(height, (y + 1) * TILE) - y * TILE);
        }
      }
      spare.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < runs.length; i += 4) spare.clearRect(runs[i], runs[i + 1], runs[i + 2], runs[i + 3]);
      spare.setTransform(...world);
      for (let i = 0; i < count; i++) {
        if (!next[i] || !this.touches(i)) continue;
        const [col, row] = cells[i];
        spare.drawImage(next[i], col * GRID - 5, row * GRID - 5, GRID + 10, GRID + 10);
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < runs.length; i += 4) {
        const x = runs[i], y = runs[i + 1], w = runs[i + 2], h = runs[i + 3];
        context.clearRect(x, y, w, h);
        context.drawImage(spare.canvas, x, y, w, h, x, y, w, h);
      }
    }
    this.next = shown ?? new Array(count);
    this.shown = next;
  }
  // Whether stitch i reaches into a tile being sewn again.
  touches(i) {
    const { tiles, across, tileOf } = this;
    for (let y = tileOf[i * 4 + 1]; y <= tileOf[i * 4 + 3]; y++) {
      for (let x = tileOf[i * 4]; x <= tileOf[i * 4 + 2]; x++) if (tiles[y * across + x]) return true;
    }
    return false;
  }
  // The tiles each stitch's sprite can touch: its box in canvas pixels,
  // rounded out, with a margin for the sprite's smoothed edges.
  planTiles() {
    const { canvas, view, dpr, cells } = this;
    const scale = dpr * view.scale, left = dpr * view.x, top = dpr * view.y, margin = 2;
    this.across = Math.max(1, Math.ceil(canvas.width / TILE));
    this.tiles = new Uint8Array(this.across * Math.max(1, Math.ceil(canvas.height / TILE)));
    const last = [this.across - 1, this.tiles.length / this.across - 1];
    const tile = (value, axis) => Math.max(0, Math.min(last[axis], Math.floor(value / TILE)));
    this.tileOf = new Int32Array(cells.length * 4);
    cells.forEach(([col, row], i) => {
      this.tileOf.set([
        tile(Math.floor(left + (col * GRID - 5) * scale) - margin, 0), tile(Math.floor(top + (row * GRID - 5) * scale) - margin, 1),
        tile(Math.ceil(left + (col * GRID + GRID + 5) * scale) + margin - 1, 0), tile(Math.ceil(top + (row * GRID + GRID + 5) * scale) + margin - 1, 1),
      ], i * 4);
    });
    this.next = new Array(cells.length);
    this.runs = [];
    this.spare ??= document.createElement('canvas').getContext('2d');
  }
  progress(key, now) {
    if (this.covered?.has(key)) return 0;
    return this.entrance.progress(key, now) * (this.departure?.progress(key, now) ?? 1);
  }
  // Leaves out the stitches in `covered` holes, which the dove is sewing over,
  // so no hole holds two threads; they return as it moves on. The scene
  // passes the same Set every frame, so a changed one is copied.
  cover(covered) {
    if (sameKeys(covered, this.covered)) return;
    this.covered = new Set(covered);
    if (this.cells && !this.animating) this.paint(performance.now());
  }
  unpick(started, reduced = false) {
    this.entrance?.finish();
    this.departure = new StitchUnpick([flameEntranceOrder(this.cells ?? [])], { started, reduced });
    if (this.cells) this.paint(started);
    this.requestFrame?.();
  }
  restore(animate = false, started = performance.now()) {
    if (animate && this.departure) this.departure.reverse(started);
    else this.departure = null;
    delete this.canvas.dataset.departure;
    if (this.cells) this.paint(started);
  }
  update(now) {
    if (this.animating) this.paint(now);
    return this.animating;
  }
  finishEntrance() {
    this.entrance?.finish();
    if (this.cells) this.paint(performance.now());
  }
}

function sameKeys(next, previous) {
  if (next.size !== (previous?.size ?? 0)) return false;
  for (const key of next) if (!previous.has(key)) return false;
  return true;
}
function write(element, name, value) {
  if (element.dataset[name] !== value) element.dataset[name] = value;
}
