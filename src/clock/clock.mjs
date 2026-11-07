import { GRID } from '../stitch/model.mjs';
import { CORNER_SIZE } from '../stitch/corners.mjs';
import { drawActiveDots } from '../stitch/dot-matrix.mjs';
import { DepartureBoard } from './departure-board.mjs';
import { ENTRANCE } from '../stitch/stitch-entrance.mjs';
import { isPhone } from '../shared/breakpoints.mjs';

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
  '-': ['000', '000', '111', '000', '000'],
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

// The clock's entrance without the welcome: each dot fades in on its own,
// at a random moment within `spread` ms after `delay`, over `dot` ms; in
// time with the corner ornaments stitching in around it (ENTRANCE).
export const CLOCK_DOTS_IN = Object.freeze({ delay: ENTRANCE.delay, dot: ENTRANCE.stitch, spread: ENTRANCE.corners });
// Each dot starts showing at once and settles, rather than easing in slowly.
const outCubic = t => 1 - (1 - t) ** 3;
// A dot's random start, fixed for the entrance (`seed`) so it never flickers.
const dotDelay = (col, row, seed) => {
  const n = Math.sin(col * 127.1 + row * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

// How far the dot at (col, row) has faded in, `elapsed` ms into the entrance.
export function dotFade(col, row, elapsed, seed = 0, { delay = 0, dot, spread } = CLOCK_DOTS_IN) {
  return outCubic(Math.max(0, Math.min(1, (elapsed - delay - dotDelay(col, row, seed) * spread) / dot)));
}

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
  const maxColumns = Math.max(27, Math.floor(width / pitch) - (isPhone(width) ? 6 : (CORNER_SIZE + 4) * 2));
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines.at(-1);
    if (last && textWidth(`${last} ${word}`) <= maxColumns) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  const bottomRows = isPhone(width) ? 17 : 7;
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

// The canvas spans the screen's width but only the rows the clock draws,
// with a row's room above and below: a few rows to clear and composite each
// second, not the whole screen. Its top and foot fall on whole CSS, canvas
// and device pixels, so each dot lands on exactly the pixels it would on a
// canvas the size of the screen. The nearest such edge at or beyond `y`,
// going `direction` (-1 up, 1 down), within 64 px; null if there is none
// (a ratio such as 1.1 never lands whole).
export function wholePixelEdge(y, direction, ratios) {
  let at = direction < 0 ? Math.floor(y) : Math.ceil(y);
  for (let step = 0; step < 64; step++, at += direction) {
    if (ratios.every(ratio => Number.isInteger(at * ratio))) return at;
  }
  return null;
}

// The band, [top, bottom) in CSS px, for rows `top` to `bottom` of the dots
// on a screen `width` by `height` px, drawn at `dpr` canvas pixels a CSS px
// and shown at `ratio` device pixels a CSS px. Null where a band could not
// be shown to land exactly as the screen's own canvas does: a screen that is
// not a whole number of canvas pixels across, or a canvas the browser scales
// on its way to the screen (a ratio over 2; dpr stops there), where moved
// by a fraction of a pixel (the colophon's pull) the scaled band and the
// scaled screen can round a dot's edge one level apart.
export function clockBand(rows, { view, width, height, dpr, ratio }) {
  if (dpr !== ratio || !Number.isInteger(width * dpr) || !Number.isInteger(height * dpr) || !(rows.top <= rows.bottom)) return null;
  const pitch = GRID * view.scale;
  const ratios = [dpr, ratio];
  const top = wholePixelEdge(view.y + (rows.top - 1) * pitch, -1, ratios);
  const bottom = wholePixelEdge(view.y + (rows.bottom + 1) * pitch, 1, ratios);
  if (top == null || bottom == null) return null;
  // The screen's own edges are the whole canvas's edges, whole or not.
  const band = { top: Math.min(Math.max(top, 0), height), bottom: Math.min(Math.max(bottom, 0), height) };
  return band.bottom > band.top ? band : { top: 0, bottom: 0 };
}

// The rows a board's glyphs cover, each five tall.
const glyphRows = (slots, rows = { top: Infinity, bottom: -Infinity }) => slots.reduce((span, slot) =>
  ({ top: Math.min(span.top, slot.row), bottom: Math.max(span.bottom, slot.row + 4) }), rows);

// Local time as 24-hour HH:MM:SS, as Intl.DateTimeFormat('en-GB', h23) writes
// it; that formatter takes ~15 ms to make, in the welcome's first moments.
const LOCAL_TIME = Object.freeze({
  format: date => [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':'),
});

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
    this.formatter = LOCAL_TIME;
    // The clock's box as laid out, without asking for layout: the band is
    // used only where the box is the window's height, as the canvas's own
    // pixels then are (clockBand). It is taken to be that height until the
    // observer reports, which it does before the frame paints: on starting,
    // and on each resize, which observes the box afresh (resize). With no
    // observer to report it, the canvas is always the screen's.
    this.boxHeight = NaN;
    if (typeof ResizeObserver === 'function') {
      this.boxHeight = undefined;
      this.observer = new ResizeObserver(([entry]) => {
        this.boxHeight = entry.borderBoxSize?.[0]?.blockSize ?? NaN;
        this.refit();
      });
      this.observer.observe(element);
    }
    // Nor while the page is pinch-zoomed, which scales the canvas on screen.
    const zoom = globalThis.visualViewport;
    this.zoomed = Boolean(zoom && zoom.scale !== 1);
    zoom?.addEventListener('resize', () => {
      if ((zoom.scale !== 1) === this.zoomed) return;
      this.zoomed = !this.zoomed;
      this.refit();
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
    this.ratio = devicePixelRatio || 1;
    // The box's last report is of the old size: rather than fit the screen
    // to it and then the band to the next, it is taken to match until it is
    // reported again. Observed afresh, it is reported before this frame
    // paints, even at the size it had, and the canvas goes back to the
    // screen's then if the box is not the window's height.
    if (this.observer) {
      this.boxHeight = undefined;
      this.observer.unobserve(this.element);
      this.observer.observe(this.element);
    }
    this.canvas.width = Math.round(width * this.dpr);
    const { glyphs } = this.layout();
    // The band starts at the rows this text takes, and grows to whatever
    // another takes (a hover message on two lines) until the next resize.
    this.rows = glyphRows(glyphs);
    this.placed = null;
    this.board.finish(glyphs);
    this.paint();
  }
  // Fits the canvas to the rows `slots` take, if they go beyond the band;
  // true if it moved (and so was cleared).
  place(slots) {
    this.rows = glyphRows(slots, this.rows);
    const exact = !this.held && !this.zoomed && (this.boxHeight === undefined || this.boxHeight === this.height);
    const band = exact ? clockBand(this.rows, this) : null;
    const placed = band ? `${band.top} ${band.bottom}` : 'screen';
    if (placed === this.placed) return false;
    this.placed = placed;
    const { canvas, dpr } = this;
    if (band) {
      canvas.style.top = `${band.top}px`;
      canvas.style.height = `${band.bottom - band.top}px`;
      canvas.height = Math.round((band.bottom - band.top) * dpr);
      this.offset = Math.round(band.top * dpr);
    } else {
      canvas.style.top = '';
      canvas.style.height = '';
      canvas.height = Math.round(this.height * dpr);
      this.offset = 0;
    }
    return true;
  }
  // Placed again where the box or the zoom changed, before the frame paints,
  // and drawn just as it last was.
  refit() {
    if (this.view && this.place(this.board.sample(this.painted))) this.paint(this.painted);
  }
  // The screen's canvas, whole, while `held`: the colophon's pull moves the
  // clock by fractions of a pixel, and moved so, the band and the screen's
  // canvas can be drawn a colour level apart. Held from the moment the pull
  // begins to the moment the page is home, both at rest, where the two
  // canvases show alike, and drawn again at once just as it last was.
  holdWhole(held) {
    if (Boolean(this.held) === held) return;
    this.held = held;
    this.refit();
  }
  tick() {
    clearTimeout(this.timer);
    const now = new Date();
    this.time = this.formatter.format(now);
    this.element.dateTime = now.toISOString();
    this.element.setAttribute('aria-label', this.loading === undefined ? this.message || `Local time ${this.time}` : `Loading ${this.loading}%`);
    if (this.view && !this.message && this.loading === undefined && !this.away) this.board.refreshTarget(this.layout().glyphs);
    this.paint();
    if (!document.hidden) this.timer = setTimeout(() => this.tick(), 1000 - Date.now() % 1000);
  }
  setMessage(message = '') {
    if (message === (this.message || '')) return;
    this.message = message;
    this.element.setAttribute('aria-label', message || `Local time ${this.time}`);
    if (this.view && !this.away) this.board.transitionTo(this.layout().glyphs, performance.now(), this.motionPreference.matches || document.hidden);
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
  // The welcome's counter rolls over to the time; with no counter shown
  // (`immediate`), the time is simply there.
  finishLoading({ immediate = false } = {}) {
    this.tick();
    delete this.loading;
    this.element.dataset.mode = 'clock';
    this.element.setAttribute('aria-label', `Local time ${this.time}`);
    if (this.view) this.board.transitionTo(this.layout().glyphs, performance.now(), immediate || this.motionPreference.matches || document.hidden);
    this.paint();
  }
  // Fades the clock's dots in, each at its own random moment (CLOCK_DOTS_IN).
  fadeInDots() {
    if (this.motionPreference.matches || document.hidden) return;
    this.dotsIn = { start: performance.now(), seed: Math.random() * 1000 };
    this.paint();
  }
  // Leaves as a departure board does: its text rolling out letter by letter
  // to a blank board, which the seconds then leave blank until it arrives.
  depart() {
    this.away = true;
    if (this.view) this.board.transitionTo([], performance.now(), this.motionPreference.matches || document.hidden);
    this.paint();
  }
  // Comes back into view as a departure board does: from blank, its text
  // rolling in letter by letter.
  arrive() {
    this.away = false;
    if (!this.view) return;
    this.board.finish([]);
    this.board.transitionTo(this.layout().glyphs, performance.now(), this.motionPreference.matches || document.hidden);
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
    this.painted = now;
    const slots = this.board.sample(now);
    this.place(slots);
    const { context: ctx, canvas, view, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // The band's top is the canvas's first row.
    ctx.setTransform(dpr, 0, 0, dpr, 0, -this.offset);
    const cells = clockGlyphCells(slots);
    const dotsIn = this.dotsIn && now - this.dotsIn.start;
    if (this.dotsIn && dotsIn >= CLOCK_DOTS_IN.delay + CLOCK_DOTS_IN.spread + CLOCK_DOTS_IN.dot) this.dotsIn = null;
    if (!this.dotsIn) drawActiveDots(ctx, cells, view);
    else {
      for (const cell of cells) {
        ctx.globalAlpha = dotFade(cell[0], cell[1], dotsIn, this.dotsIn.seed);
        if (ctx.globalAlpha > 0) drawActiveDots(ctx, [cell], view);
      }
      ctx.globalAlpha = 1;
    }
    this.element.dataset.departure = this.board.active ? 'cycling' : 'settled';
    this.element.dataset.dots = this.dotsIn ? 'fading' : 'in';
    if ((this.board.active || this.dotsIn) && !this.frame && !document.hidden) {
      this.frame = requestAnimationFrame(time => {
        this.frame = null;
        this.paint(time);
      });
    }
  }
}
