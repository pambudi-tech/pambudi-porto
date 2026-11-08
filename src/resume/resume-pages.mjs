import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { revealCover } from '../project/cover-reveal.mjs';
import { canvasPlan, linkBox, linkLabel, opensTab } from './resume-layout.mjs';

// The resume's pages as white sheets (resume-view.mjs). Before the PIN, each
// sheet shows its locked page (tools/resume/build.mjs: the pages, their words
// scrambled, in the locked dither, as a protected work's cover). After, the
// page as pdf.js draws it on a canvas, with its text laid over it, selectable
// and read aloud, and its links. The drawn page arrives as a protected cover
// does after the PIN (cover-reveal.mjs), or for a visitor who already holds
// the pass, faded in or at once. Pages are drawn ahead, off the page, so only
// finished pages ever move.

// The locked pages, and the width of the small sample they were baked from.
export const LOCKED_PAGES = Object.freeze({
  sources: ['/assets/resume/locked-1.webp', '/assets/resume/locked-2.webp'],
  sample: 140,
});
const FADE = 280;

let pdfjsReady = null;
// pdf.js comes with the resume's first need, never with the homepage; its
// worker starts loading at once, ahead of the first document.
export function loadPdfjs() {
  pdfjsReady ??= import('pdfjs-dist').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(workerUrl, { type: 'module' });
    return pdfjs;
  });
  return pdfjsReady;
}

export class ResumePages {
  constructor(root, { scroller, onCount } = {}) {
    this.root = root;
    this.scroller = scroller;
    this.onCount = onCount;
    this.sheets = [...root.querySelectorAll('.resume-sheet')];
    this.images = this.sheets.map(sheet => sheet.querySelector('.resume-page'));
    this.shown = null;
    this.seen = new Map();
    this.count = new IntersectionObserver(entries => this.counted(entries), { root: scroller, threshold: [0, .25, .5, .75, 1] });
    let timer;
    new ResizeObserver(() => {
      if (!this.shown || !this.sheets[0].clientWidth) return;
      // The text and links follow the width at once; the page, a moment later.
      this.scaleText();
      clearTimeout(timer);
      timer = setTimeout(() => this.redraw(), 180);
    }).observe(root);
  }

  // The sheets' width as they show, or will (resume.css: at most 820 px, and
  // 16 px in from each side).
  width() { return this.sheets[0].clientWidth || Math.min(820, innerWidth - 32); }

  // The locked pages, decoded, so they show the moment they are wanted.
  lockedReady() {
    this.locked ??= Promise.all(LOCKED_PAGES.sources.map(src => {
      const image = Object.assign(new Image(), { src });
      return image.decode().then(() => image, () => image);
    }));
    return this.locked;
  }

  // Each sheet back to its locked page alone.
  showLocked() {
    this.sheets.forEach((sheet, index) => {
      const image = this.images[index];
      image.src = LOCKED_PAGES.sources[index];
      sheet.replaceChildren(image);
    });
    this.root.setAttribute('aria-hidden', 'true');
    this.shown = null;
  }

  // The resume drawn for `width`, off the page: per page a canvas, its text
  // layer and its links, ready to show.
  async draw(bytes, width = this.width()) {
    const pdfjs = await loadPdfjs();
    // pdf.js lets a document go through the task that loaded it.
    const task = pdfjs.getDocument({ data: bytes.slice(), useWasm: false, isEvalSupported: false });
    const doc = await task.promise;
    const pages = await Promise.all(Array.from({ length: doc.numPages }, (_, index) => doc.getPage(index + 1)));
    const parts = await Promise.all(pages.map(page => this.drawPage(pdfjs, page, width)));
    return { task, pages, parts, width };
  }

  async drawPage(pdfjs, page, width) {
    const plan = canvasPlan(width, page.view, devicePixelRatio || 1);
    const [canvas, text, links] = await Promise.all([this.render(page, plan), this.textLayer(pdfjs, page, plan.scale), this.links(page)]);
    return { canvas, text, links, scale: plan.scale, width: plan.width };
  }

  async render(page, plan) {
    const viewport = page.getViewport({ scale: plan.scale * plan.ratio });
    const canvas = Object.assign(document.createElement('canvas'), { className: 'resume-page', width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
    canvas.setAttribute('aria-hidden', 'true');
    await page.render({ canvas, viewport }).promise;
    return canvas;
  }

  async textLayer(pdfjs, page, scale) {
    const text = Object.assign(document.createElement('div'), { className: 'textLayer' });
    text.style.setProperty('--total-scale-factor', scale);
    await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport: page.getViewport({ scale }) }).render();
    return text;
  }

  async links(page) {
    const layer = Object.assign(document.createElement('div'), { className: 'resume-links' });
    for (const annotation of await page.getAnnotations()) {
      if (annotation.subtype !== 'Link' || !annotation.url) continue;
      const link = Object.assign(document.createElement('a'), { href: annotation.url });
      link.setAttribute('aria-label', linkLabel(annotation.url));
      if (opensTab(annotation.url)) Object.assign(link, { target: '_blank', rel: 'noopener noreferrer' });
      Object.assign(link.style, linkBox(annotation.rect, page.view));
      layer.append(link);
    }
    return layer;
  }

  // Shows a drawing: `how` is 'reveal' (the locked page sharpening into it,
  // as a cover after the PIN), 'fade' or 'now'. Resolves once it stands.
  async show(drawing, how = 'now', { reduced = false } = {}) {
    const previous = this.shown;
    this.shown = drawing;
    const arrivals = drawing.parts.map((part, index) => {
      const sheet = this.sheets[index], image = this.images[index];
      if (!sheet) return null;
      sheet.style.setProperty('--total-scale-factor', part.scale);
      part.text.style.removeProperty('--total-scale-factor');
      // The locked page stays in place until the drawn one has replaced it.
      sheet.querySelectorAll(':scope > :not(.resume-page)').forEach(node => node.remove());
      sheet.querySelectorAll(':scope > canvas.resume-page').forEach(node => { if (node !== part.canvas) node.remove(); });
      sheet.append(part.text, part.links);
      const settle = () => { if (image.isConnected) image.replaceWith(part.canvas); else if (!part.canvas.isConnected) sheet.prepend(part.canvas); };
      if (how === 'reveal' && image.isConnected) return revealCover(image, part.canvas, { reduced, sample: LOCKED_PAGES.sample, swap: settle });
      if (how === 'fade' && !reduced && image.isConnected) return this.fadeIn(image, part.canvas);
      settle();
      return null;
    });
    this.root.removeAttribute('aria-hidden');
    this.watchCount();
    await Promise.all(arrivals);
    if (previous && previous !== drawing) previous.task.destroy();
  }

  // The drawn page fades in over the locked one, which then leaves.
  async fadeIn(image, canvas) {
    image.after(canvas);
    await canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, easing: 'ease' }).finished.catch(() => {});
    image.remove();
  }

  scaleText() {
    this.shown.pages.forEach((page, index) => {
      const [x0, , x1] = page.view;
      this.sheets[index]?.style.setProperty('--total-scale-factor', this.sheets[index].clientWidth / (x1 - x0));
    });
  }

  // The pages again at a new width, swapped in once drawn.
  async redraw() {
    const drawing = this.shown;
    await Promise.all(drawing.pages.map(async (page, index) => {
      const part = drawing.parts[index];
      const plan = canvasPlan(this.width(), page.view, devicePixelRatio || 1);
      if (!part || plan.width === part.width) return;
      part.width = plan.width;
      const next = await this.render(page, plan).catch(() => null);
      if (!next || this.shown !== drawing || !part.canvas.isConnected) return;
      part.canvas.replaceWith(next);
      part.canvas = next;
    }));
  }

  // A line on the first sheet in place of its page, with one way on.
  note(text, action) {
    const box = Object.assign(document.createElement('div'), { className: 'resume-note' });
    box.append(Object.assign(document.createElement('p'), { textContent: text }));
    if (action) {
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'resume-note-action', textContent: action.label });
      button.addEventListener('click', action.run);
      box.append(button);
    }
    this.sheets[0].append(box);
  }

  // The count follows the page most in view.
  watchCount() {
    this.count.disconnect();
    this.seen.clear();
    this.sheets.forEach(sheet => this.count.observe(sheet));
    this.onCount?.(1, this.sheets.length);
  }

  counted(entries) {
    for (const entry of entries) this.seen.set(entry.target, entry.intersectionRatio);
    let best = 0;
    this.sheets.forEach((sheet, index) => { if ((this.seen.get(sheet) ?? 0) > (this.seen.get(this.sheets[best]) ?? 0)) best = index; });
    this.onCount?.(best + 1, this.sheets.length);
  }
}
