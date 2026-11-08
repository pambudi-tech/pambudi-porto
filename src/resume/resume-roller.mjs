import { ROLLER, rollKeyframes, rollerRadius, rollsSmoothly, stripHeight } from '../works/sheet-roller.mjs';

// The resume's pages roll over the screen's top and bottom edges as the
// exploration sheet's lines do (sheet-roller.mjs, whose curve and keyframes
// these are): between the two curl lines a page lies flat; past them it
// wraps over a cylinder, away from the eye at the screen's middle, drawn as
// thin strips, each placed on the curve by its own two edges. Each strip is a
// slice of its page, drawn once from what the page shows (its locked dither,
// or the resume itself), and moved by the scroll on the compositor, through
// one shared set of keyframes, so nothing is worked out as it scrolls. Where
// the browser cannot drive animations by the scroll, or motion is reduced,
// the pages stay flat.

// Device pixels per CSS pixel the strips are sliced at, at most: they curve
// away from the eye, so they need less than the flat page.
const SLICE_DPR = 1.5;

export class ResumeRoller {
  constructor(root, { scroller, sheets }) {
    this.root = root;
    this.scroller = scroller;
    this.sheetsRoot = sheets;
    this.layer = Object.assign(document.createElement('div'), { className: 'resume-roller' });
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.inert = true;
    this.layer.style.perspective = `${ROLLER.perspective}px`;
    // Under the pages: those between the curl lines cover their strips.
    scroller.before(this.layer);
    this.style = document.createElement('style');
    document.head.append(this.style);
    this.pages = [];
    this.key = null;
  }

  // Lays the strips out for the sheets as they lie now (the view open), from
  // `sources`, each sheet's image or canvas; null, or motion reduced, leaves
  // the pages flat. Only a new size or layout makes the strips again.
  setup(sources, { reduced = false } = {}) {
    const sheets = [...this.sheetsRoot.querySelectorAll('.resume-sheet')];
    const rolls = sources && !reduced && rollsSmoothly() && sheets.length && sheets[0].offsetHeight;
    if (!rolls) {
      this.clear();
      return;
    }
    // The curl lines: where the first page rests at the top, and as far in
    // from the bottom, as the exploration sheet's.
    const height = innerHeight, top = sheets[0].offsetTop, bottom = height - top;
    const radius = rollerRadius(top, height), strip = stripHeight(radius);
    const boxes = sheets.map(sheet => ({ x: sheet.offsetLeft, y: sheet.offsetTop, w: sheet.offsetWidth, h: sheet.offsetHeight }));
    const key = `${innerWidth}x${height}:${boxes.map(box => `${box.x},${box.y},${box.w},${box.h}`).join('|')}`;
    if (key !== this.key) {
      this.clear();
      this.key = key;
      const { frames, span } = rollKeyframes({ top, bottom, radius, strip });
      this.style.textContent = `@keyframes resume-roll {${frames.map(frame =>
        `${(frame.offset * 100).toFixed(5)}%{transform:${frame.transform};opacity:${frame.opacity}}`).join('')}}`;
      const reach = radius * Math.PI / 2, below = height - bottom - reach;
      const names = [];
      this.pages = boxes.map((box, index) => {
        const name = `--resume-page-${index}`, count = Math.ceil(box.h / strip);
        names.push(name);
        // Where the page lies in the scroll, for its strips to follow.
        const mark = Object.assign(document.createElement('div'), { className: 'resume-roller-mark' });
        Object.assign(mark.style, { top: `${box.y}px`, height: `${box.h}px` });
        mark.style.setProperty('view-timeline', `${name} block`);
        mark.style.setProperty('view-timeline-inset', `${(top - reach - (count * strip - box.h)).toFixed(2)}px ${below.toFixed(2)}px`);
        this.sheetsRoot.append(mark);
        const strips = Array.from({ length: count }, (_, at) => {
          const element = Object.assign(document.createElement('div'), { className: 'resume-roller-strip' });
          Object.assign(element.style, { left: `${box.x - 2}px`, width: `${box.w + 4}px`, height: `${strip + ROLLER.overlap}px` });
          element.style.animation = 'resume-roll linear both';
          element.style.setProperty('animation-timeline', name);
          element.style.setProperty('animation-range', `cover ${at * strip}px cover ${at * strip + span}px`);
          const canvas = document.createElement('canvas');
          element.append(canvas);
          return { element, canvas, at };
        });
        this.layer.append(...strips.map(item => item.element));
        return { mark, strips, box, strip };
      });
      this.root.style.setProperty('timeline-scope', names.join(', '));
      this.root.style.setProperty('--curl-top', `${top}px`);
      this.root.style.setProperty('--curl-bottom', `${bottom}px`);
    }
    this.paint(sources);
    this.root.classList.add('is-rolling');
  }

  // Each strip's slice of what its page shows, a few strips a frame, so
  // slicing never holds the page up (the roller fades in after the pages,
  // resume.css); a page that still shows the same thing keeps its strips.
  paint(sources) {
    this.queue ??= new Map();
    this.pages.forEach((page, index) => {
      const source = sources?.[index];
      const width = source?.naturalWidth ?? source?.width, height = source?.naturalHeight ?? source?.height;
      if (!width || !height || (page.source === source && page.sourceWidth === width)) return;
      Object.assign(page, { source, sourceWidth: width });
      for (const strip of page.strips) this.queue.set(strip, { page, source, width, height });
    });
    if (!this.queue.size || this.painting) return;
    const run = () => {
      const until = performance.now() + 6;
      for (const [strip, job] of this.queue) {
        if (performance.now() > until) break;
        this.queue.delete(strip);
        this.paintStrip(strip, job);
      }
      this.painting = this.queue.size ? requestAnimationFrame(run) : null;
    };
    this.painting = requestAnimationFrame(run);
  }

  paintStrip({ canvas, at }, { page: { box, strip }, source, width, height }) {
    const ratio = Math.min(devicePixelRatio || 1, SLICE_DPR), scale = height / box.h;
    const w = Math.round(box.w * ratio), h = Math.round((strip + ROLLER.overlap) * ratio);
    if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, w, h);
    context.drawImage(source, 0, at * strip * scale, width, (strip + ROLLER.overlap) * scale, 0, 0, w, h);
  }

  clear() {
    cancelAnimationFrame(this.painting);
    this.painting = null;
    this.queue?.clear();
    for (const { mark, strips } of this.pages) {
      mark.remove();
      strips.forEach(({ element }) => element.remove());
    }
    this.pages = [];
    this.key = null;
    this.root.classList.remove('is-rolling');
    this.root.style.removeProperty('timeline-scope');
  }
}
