import { GRID } from './model.mjs';
import { coverageTable, traceWordmark, WORDMARK_RATIO } from './wordmark-grid.mjs';
import { StitchEntrance, ENTRANCE, flameEntranceOrder } from './stitch-entrance.mjs';
import { drawActiveDots, ORNAMENT_COLOR } from './dot-matrix.mjs';
import { StitchUnpick } from './stitch-unpick.mjs';

export class StitchWordmark {
  constructor(canvas, sprite, { requestFrame, motionPreference, entranceStarted } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.sprite = sprite;
    this.requestFrame = requestFrame;
    this.motionPreference = motionPreference;
    this.entranceStarted = entranceStarted;
    this.ready = this.load().catch(error => console.error('Wordmark tracing:', error));
  }
  async load() {
    const image = new Image();
    image.src = '/assets/wordmark-source.png';
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
    this.isDots = width <= 540;
    const options = this.isDots ? { startRow: Math.ceil(-view.y / pitch) + 1 } : {};
    const { cells, height, bottomRow } = traceWordmark(this.table, this.sourceWidth, this.sourceHeight, width, view, pitch, options);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.ceil((this.isDots ? view.y + bottomRow * pitch : height) * dpr);
    this.cells = cells;
    this.dpr = dpr;
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
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (this.isDots) {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawActiveDots(context, this.cells, view, (col, row) => this.progress(`${col},${row}`, now), '#d6d6d6');
    } else {
      context.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
      for (const [col, row] of this.cells) {
        const progress = this.progress(`${col},${row}`, now);
        if (progress <= 0) continue;
        const variation = ((col * 17 + row * 31) % 8 + 8) % 8;
        context.drawImage(this.sprite(ORNAMENT_COLOR, variation, progress), col * GRID - 5, row * GRID - 5, GRID + 10, GRID + 10);
      }
    }
    this.animating = this.entrance.active(now) || Boolean(this.departure?.active(now));
    canvas.dataset.entrance = this.animating ? 'stitching' : 'complete';
    if (this.departure) canvas.dataset.departure = this.departure.active(now) ? 'unpick' : 'complete';
  }
  progress(key, now) { return this.entrance.progress(key, now) * (this.departure?.progress(key, now) ?? 1); }
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
