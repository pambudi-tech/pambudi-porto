import { GRID } from './model.mjs';
import { coverageTable, traceWordmark, WORDMARK_RATIO } from './wordmark-grid.mjs';
import { StitchEntrance, ENTRANCE, wordmarkEntranceOrder } from './stitch-entrance.mjs';

export class StitchWordmark {
  constructor(canvas, sprite, { requestFrame, motionPreference } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.sprite = sprite;
    this.requestFrame = requestFrame;
    this.motionPreference = motionPreference;
    this.initialDesktop = innerWidth > 540;
    this.load().catch(error => console.error('Wordmark tracing:', error));
  }
  async load() {
    const image = new Image();
    image.src = new URL('./assets/wordmark-source.png', import.meta.url).href;
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
    if (this.width <= 540) {
      this.canvas.width = this.canvas.height = 0;
      this.canvas.dataset.layout = 'hidden';
      this.canvas.dataset.ready = 'true';
      this.animating = false;
      this.entrance?.finish();
      return;
    }
    if (!this.table || !this.view) return;
    const { width, view, canvas, context } = this;
    const pitch = GRID * view.scale;
    const { cells, height } = traceWordmark(this.table, this.sourceWidth, this.sourceHeight, width, view, pitch);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    this.cells = cells;
    this.dpr = dpr;
    this.entrance ??= new StitchEntrance({ started: performance.now(), sweep: ENTRANCE.wordmark, reduced: this.motionPreference?.matches || !this.initialDesktop });
    this.entrance.plan([wordmarkEntranceOrder(cells)]);
    this.paint(performance.now());
    canvas.dataset.stitches = String(cells.length);
    canvas.dataset.layout = 'single-line';
    canvas.dataset.ready = 'true';
    if (this.animating) this.requestFrame?.();
  }
  paint(now) {
    const { canvas, context, view, dpr } = this;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
    for (const [col, row] of this.cells) {
      const progress = this.entrance.progress(`${col},${row}`, now);
      if (progress <= 0) continue;
      const variation = ((col * 17 + row * 31) % 8 + 8) % 8;
      context.drawImage(this.sprite('#ffffff', variation, progress), col * GRID - 5, row * GRID - 5, GRID + 10, GRID + 10);
    }
    this.animating = this.entrance.active(now);
    canvas.dataset.entrance = this.animating ? 'stitching' : 'complete';
  }
  update(now) {
    if (this.animating) this.paint(now);
    return this.animating;
  }
  finishEntrance() {
    this.entrance?.finish();
    if (this.cells && this.width > 540) this.paint(performance.now());
  }
}
