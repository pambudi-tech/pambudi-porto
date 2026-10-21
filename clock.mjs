import { GRID } from './model.mjs';

// One matrix point corresponds to one perforation in the cloth.
const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  ':': ['0', '1', '0', '1', '0'],
};

export class DotClock {
  constructor(element) {
    this.element = element;
    this.canvas = element.querySelector('canvas');
    this.context = this.canvas.getContext('2d');
    this.formatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    document.addEventListener('visibilitychange', () => {
      clearTimeout(this.timer);
      if (!document.hidden) this.tick();
    });
    this.tick();
  }
  resize(width, height, view) {
    this.width = width;
    this.height = height;
    this.view = { ...view };
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.paint();
  }
  tick() {
    clearTimeout(this.timer);
    const now = new Date();
    this.time = this.formatter.format(now);
    this.element.dateTime = now.toISOString();
    this.element.setAttribute('aria-label', `Local time ${this.time}`);
    this.paint();
    if (!document.hidden) this.timer = setTimeout(() => this.tick(), 1000 - Date.now() % 1000);
  }
  paint() {
    if (!this.view) return;
    const { context: ctx, canvas, view, dpr, width, height } = this;
    const pitch = GRID * view.scale;
    const safeBottom = parseFloat(getComputedStyle(this.element).paddingBottom) || 0;
    // The mobile ornaments turn inward along the bottom; sit above those tails.
    const bottomRows = width <= 540 ? 17 : 7;
    const row = Math.floor((height - safeBottom - view.y) / pitch) - bottomRows;
    let col = -13;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#49483f';
    ctx.beginPath();
    for (const character of this.time) {
      const glyph = DIGITS[character];
      glyph.forEach((line, y) => [...line].forEach((cell, x) => {
        if (cell !== '1') return;
        const px = view.x + (col + x) * pitch;
        const py = view.y + (row + y) * pitch;
        ctx.moveTo(px + pitch * .24, py);
        ctx.arc(px, py, pitch * .24, 0, Math.PI * 2);
      }));
      col += glyph[0].length + 1;
    }
    ctx.fill();
  }
}
