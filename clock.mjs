import { GRID } from './model.mjs';
import { CORNER_SIZE } from './corners.mjs';
import { drawActiveDots } from './dot-matrix.mjs';
import { DepartureBoard } from './departure-board.mjs';

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
  '%': ['11001', '11010', '00100', '01011', '10011'],
  ' ': ['00', '00', '00', '00', '00'],
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['111', '100', '100', '100', '111'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['111', '100', '101', '101', '111'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['111', '001', '001', '101', '111'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['10001', '11011', '10101', '10001', '10001'],
  N: ['101', '111', '111', '111', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '011', '001'],
  R: ['110', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['10001', '10001', '10101', '11011', '10001'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
};

const textWidth = text => [...text].reduce((width, char) => width + (DIGITS[char] ?? DIGITS[' '])[0].length + 1, -1);

export function clockGlyphCells(slots) {
  const cells = [];
  for (const slot of slots) {
    const glyph = DIGITS[slot.char] ?? DIGITS[' '];
    const offset = Math.floor((slot.width - glyph[0].length) / 2);
    glyph.forEach((bits, y) => [...bits].forEach((bit, x) => {
      if (bit === '1') cells.push([slot.col + offset + x, slot.row + y]);
    }));
  }
  return cells;
}

export function clockTextLayout(text, { width, height, view, safeBottom = 0 }) {
  const pitch = GRID * view.scale;
  // Keep long messages between the desktop ornaments. Mobile has a separate
  // clock row above their tails, so it can use the available screen width.
  const maxColumns = Math.max(27, Math.floor(width / pitch) - (width <= 540 ? 6 : (CORNER_SIZE + 4) * 2));
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines.at(-1);
    if (last && textWidth(`${last} ${word}`) <= maxColumns) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  const bottomRows = width <= 540 ? 21 : 7;
  const row = Math.floor((height - safeBottom - view.y) / pitch) - bottomRows - (lines.length - 1) * 7;
  const glyphs = [];
  lines.forEach((line, index) => {
    let col = Math.round((width / 2 - view.x) / pitch - (textWidth(line) - 1) / 2);
    for (const character of line) {
      const glyph = DIGITS[character] ?? DIGITS[' '];
      glyphs.push({ char: character, col, row: row + index * 7, width: glyph[0].length });
      col += glyph[0].length + 1;
    }
  });
  return { lines, glyphs, cells: clockGlyphCells(glyphs) };
}

export class DotClock {
  constructor(element) {
    this.element = element;
    this.canvas = element.querySelector('canvas');
    this.context = this.canvas.getContext('2d');
    this.board = new DepartureBoard();
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionPreference.addEventListener('change', () => {
      if (this.motionPreference.matches) this.settle();
    });
    this.formatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    document.addEventListener('visibilitychange', () => {
      clearTimeout(this.timer);
      if (document.hidden) this.settle();
      else this.tick();
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
    this.board.finish(this.layout().glyphs);
    this.paint();
  }
  tick() {
    clearTimeout(this.timer);
    const now = new Date();
    this.time = this.formatter.format(now);
    this.element.dateTime = now.toISOString();
    this.element.setAttribute('aria-label', this.loading === undefined ? this.message || `Local time ${this.time}` : `Loading ${this.loading}%`);
    if (this.view && !this.message && this.loading === undefined) this.board.refreshTarget(this.layout().glyphs);
    this.paint();
    if (!document.hidden) this.timer = setTimeout(() => this.tick(), 1000 - Date.now() % 1000);
  }
  setMessage(message = '') {
    if (message === (this.message || '')) return;
    this.message = message;
    this.element.setAttribute('aria-label', message || `Local time ${this.time}`);
    if (this.view) this.board.transitionTo(this.layout().glyphs, performance.now(), this.motionPreference.matches || document.hidden);
    this.paint();
  }
  setLoading(percent) {
    const next = Math.max(this.loading ?? 0, Math.min(100, Math.floor(percent)));
    if (next === this.loading) return;
    this.loading = next;
    this.element.dataset.mode = 'loading';
    this.element.setAttribute('aria-label', `Loading ${next}%`);
    // Progress must show its actual value. Scrambled intermediate digits are
    // reserved for the handoff to the clock and its hover messages.
    if (this.view) this.board.finish(this.layout().glyphs);
    this.paint();
  }
  finishLoading() {
    this.tick();
    delete this.loading;
    this.element.dataset.mode = 'clock';
    this.element.setAttribute('aria-label', `Local time ${this.time}`);
    if (this.view) this.board.transitionTo(this.layout().glyphs, performance.now(), this.motionPreference.matches || document.hidden);
    this.paint();
  }
  layout() {
    const safeBottom = parseFloat(getComputedStyle(this.element).paddingBottom) || 0;
    return clockTextLayout(this.loading === undefined ? this.message || this.time : `${this.loading}%`, { width: this.width, height: this.height, view: this.view, safeBottom });
  }
  settle() {
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.board.finish();
    this.paint();
  }
  paint(now = performance.now()) {
    if (!this.view) return;
    const { context: ctx, canvas, view, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cells = clockGlyphCells(this.board.sample(now));
    drawActiveDots(ctx, cells, view);
    this.element.dataset.departure = this.board.active ? 'cycling' : 'settled';
    if (this.board.active && !this.frame && !document.hidden) {
      this.frame = requestAnimationFrame(time => {
        this.frame = null;
        this.paint(time);
      });
    }
  }
}
