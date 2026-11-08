import '../styles/resume.css';
import { mountPinPanel } from '../project/project-pin.mjs';
import { WORKS_VEIL, aberrationFilter } from '../works/gallery.mjs';
import { ResumePages, loadPdfjs } from './resume-pages.mjs';
import { ResumeRoller } from './resume-roller.mjs';
import { isPhone } from '../shared/breakpoints.mjs';
import { GRID } from '../stitch/model.mjs';

// The resume on the homepage, at /resume: About Me's "resume" shrinks the
// paper a little as it fades, and the clock with it, while the resume's pages
// settle onto the cloth under a bar like the works row's: back, then the page
// count and the download. The PDF sits behind the works PIN (api/resume.js):
// until it, the pages show blurred (a teaser, every word below the header
// scrambled), with the works PIN panel at the bottom over the exploration
// sheet's own veil, its blur and parted colours growing in. The right PIN
// draws the resume and puts it in the teaser's place under the blur, while
// "unlocked for a day" shows; then the blur clears. "back" mirrors the way in: the
// pages and the bar leave as the paper grows back into place, the side it
// left from up, and the clock returns. Scrolled, the pages roll over the screen's top and
// bottom edges under the exploration sheet's veils, as its lines do
// (resume-roller.mjs).

// `settle`: ms for the pages to settle before the PIN panel and the veil
// come; `veilAbove`: px the veil reaches above the panel; `veilIn` /
// `veilOut`: ms for its blur to grow from nothing to full and back;
// `blur`: the locked pages' blur, as a share of their width; `unblur`: ms
// for it to clear (resume.css).
// `settled`: ms for a right PIN's digits to settle before the pages are drawn.
// `swap`: ms for the paper to shrink and fade, and back; `shrink`: how small
// it gets; `follow`: the share of that the pages wait before arriving, so
// they follow the paper out rather than cover it.
export const RESUME_VIEW = Object.freeze({ path: '/resume', fade: 280, swap: 460, shrink: .88, follow: .55, settle: 420, veilAbove: 56, veilIn: 600, veilOut: 600, blur: .009, unblur: 900, settled: 460 });
const FILE = 'Ivan-Pambudi-Resume.pdf';
const PROMPT = 'enter pin to view the resume';
const PENDING = Symbol('pending');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchBytes(url) {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (response.status === 401) return 'locked';
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : 'error';
  } catch {
    return 'error';
  }
}

// Asked first, as the works row asks, so a locked visit makes no failed request.
async function holdsPass() {
  try {
    const response = await fetch('/api/pass', { credentials: 'same-origin' });
    return response.ok ? (await response.json()).passed === true : null;
  } catch {
    return null;
  }
}

export class ResumeView {
  constructor(root, { scene, paper, link, motionPreference }) {
    this.root = root;
    this.scene = scene;
    this.paper = paper;
    this.link = link;
    this.aboutLink = paper.querySelector('.intro-link');
    this.motionPreference = motionPreference;
    this.clock = document.getElementById('portfolio-clock');
    this.scroller = root.querySelector('.resume-scroll');
    this.tools = root.querySelector('.resume-tools');
    this.countLabel = root.querySelector('.resume-count');
    this.download = root.querySelector('.resume-download');
    this.back = root.querySelector('.resume-back');
    this.veil = root.querySelector('.resume-veil');
    const sheets = root.querySelector('.resume-sheets');
    this.pages = new ResumePages(sheets, {
      scroller: this.scroller,
      onCount: (current, total) => { this.countLabel.textContent = `${current} / ${total}`; },
    });
    this.roller = new ResumeRoller(root, { scroller: this.scroller, sheets });
    this.isOpen = false;
    this.busy = false;
    this.bytes = null;
    this.drawing = null;
    this.makeVeil();
    this.makeEdges();
    this.scroller.addEventListener('scroll', () => this.updateEdges(), { passive: true });
    this.back.addEventListener('click', () => this.close());
    this.download.addEventListener('click', () => this.save());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.isOpen && !this.busy) this.close();
    });
    let resized;
    addEventListener('resize', () => {
      if (this.pin) this.placeVeil();
      clearTimeout(resized);
      resized = setTimeout(() => {
        if (!this.isOpen) return;
        this.placeTop();
        this.roll();
      }, 260);
    });
    addEventListener('popstate', () => {
      const here = location.pathname.replace(/\/$/, '') === RESUME_VIEW.path;
      if (here !== this.isOpen) here ? this.open({ history: false }) : this.close({ history: false });
    });
  }

  get reduced() { return this.motionPreference.matches; }

  // Readied ahead, on the visitor's way here, so opening only moves finished
  // things: the teaser pages, decoded; and for a visitor with the pass, the
  // resume itself, fetched and drawn.
  warm() {
    this.pages.teaserReady();
    this.live().catch(() => {});
  }

  // The resume drawn for the sheets' width, or 'locked' without a pass, or
  // 'error'. Kept until the width changes or the pass does. `before`: what
  // the drawing waits for, once the PDF is fetched.
  live({ before } = {}) {
    const width = this.pages.width();
    if (this.drawing?.width !== width) {
      const promise = (async () => {
        if (!this.bytes) {
          if (await holdsPass() === false) return 'locked';
          const bytes = await fetchBytes('/api/resume');
          if (!(bytes instanceof Uint8Array)) return bytes;
          this.bytes = bytes;
        }
        await before;
        return this.pages.draw(this.bytes, width);
      })();
      const drawing = { width, promise };
      this.drawing = drawing;
      // An answer without the resume is asked again next time.
      const forget = () => { if (this.drawing === drawing) this.drawing = null; };
      promise.then(result => { if (!result?.parts) forget(); }, forget);
    }
    return this.drawing.promise;
  }

  // `instant`: already open as the page shows (its own address).
  async open({ history = true, instant = false } = {}) {
    if (this.isOpen || this.busy) return;
    this.busy = true;
    const live = this.live();
    live.catch(() => {});
    const teaser = this.pages.teaserReady();
    this.fromRed = this.paper.dataset.paperSide === 'red';
    if (history && location.pathname !== RESUME_VIEW.path) window.history.pushState({ resume: true }, '', RESUME_VIEW.path);
    this.scene.setPaperPresent(false);
    this.scene.setBirdAway?.(true, { immediate: instant });
    this.paper.inert = true;
    this.paper.dispatchEvent(new CustomEvent('paperflipstart'));
    document.body.classList.add('resume-open');
    this.clock?.setAttribute('aria-hidden', 'true');
    // The paper shrinks and fades as the pages arrive, together.
    const away = instant ? null : this.fadePaper(true);
    away?.then(() => { if (this.isOpen) this.paper.style.visibility = 'hidden'; });
    await teaser;
    // The resume, if it is drawn already, shows from the first frame; else
    // the teaser, blurred, until it is.
    const ready = await Promise.race([live, Promise.resolve(PENDING)]).catch(() => PENDING);
    if (ready?.parts) await this.pages.show(ready, 'now');
    else this.pages.showTeaser();
    // Blurred before it shows, so it arrives blurred.
    this.root.classList.toggle('is-blurred', !ready?.parts);
    if (!away) this.paper.style.visibility = 'hidden';
    this.root.hidden = false;
    this.isOpen = true;
    this.placeTop();
    this.scroller.scrollTop = 0;
    this.setLocked(ready?.parts ? false : null);
    // The roller a frame on: it fades in after the pages (resume.css), so
    // building its strips apart from their first frame cannot be seen.
    requestAnimationFrame(() => { if (this.isOpen) this.roll(); });
    const follow = instant || this.reduced ? 0 : RESUME_VIEW.swap * RESUME_VIEW.follow;
    this.openedAt = performance.now() + follow;
    if (instant || this.reduced) {
      this.openedAt -= RESUME_VIEW.settle;
      this.root.classList.add('is-instant', 'is-open');
      requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('is-instant')));
    } else setTimeout(() => { if (this.isOpen) this.root.classList.add('is-open'); }, follow);
    this.back.focus({ preventScroll: true, focusVisible: false });
    this.busy = false;
    // Its text and links once the pages have settled.
    if (ready?.parts) return this.layersLater(ready, RESUME_VIEW.settle);
    let result;
    try {
      result = await live;
    } catch (problem) {
      console.warn('Resume could not be drawn:', problem);
      if (this.isOpen) this.unsupported();
      return;
    }
    if (!this.isOpen) return;
    if (result === 'locked') return this.lock();
    if (result === 'error') return this.failed();
    this.setLocked(false);
    this.root.classList.remove('is-blurred');
    await this.pages.show(result, 'fade', { reduced: this.reduced });
    this.roll();
    this.layersLater(result, 0);
  }

  // The drawing's text and links, `delay` ms on, if it still shows then.
  layersLater(drawing, delay) {
    setTimeout(() => {
      if (this.isOpen && this.pages.shown === drawing) this.pages.layers(drawing).catch(() => {});
    }, this.reduced ? 0 : delay);
  }

  // The pages start under the bar as the exploration sheet's first line does
  // (gallery.mjs layout): 16 px below it on a phone, 24 elsewhere, on the
  // cloth's stitch grid; the last rests as far up from the bottom. The
  // roller's curl lines and the edge veils follow from it. The locked
  // pages' blur grows with their width, to keep their words unreadable.
  placeTop() {
    const view = this.scene.view, pitch = GRID * view.scale;
    const bar = this.root.querySelector('.resume-nav').getBoundingClientRect().bottom;
    const top = view.y + Math.ceil((bar + (isPhone(innerWidth) ? 16 : 24) - view.y) / pitch) * pitch;
    this.root.style.setProperty('--resume-top', `${top}px`);
    this.root.style.setProperty('--page-blur', `${Math.max(3, this.pages.width() * RESUME_VIEW.blur).toFixed(1)}px`);
  }

  async close({ history = true } = {}) {
    if (!this.isOpen || this.busy) return;
    this.busy = true;
    if (history && location.pathname === RESUME_VIEW.path) {
      if (window.history.state?.resume) window.history.back();
      else window.history.replaceState(null, '', '/');
    }
    this.root.classList.remove('is-open');
    this.pin?.element.classList.add('is-leaving');
    clearTimeout(this.veilTimer);
    this.veilTo(0, RESUME_VIEW.fade);
    // The pages leave as the paper grows back into place, and the clock with it.
    this.scene.restPaper?.();
    this.scene.relightPaper?.();
    this.paper.style.visibility = '';
    this.scene.setBirdAway?.(false);
    if (this.clock && !this.reduced) {
      this.clock.style.transition = `opacity ${RESUME_VIEW.swap}ms ease`;
      setTimeout(() => this.clock.style.removeProperty('transition'), RESUME_VIEW.swap + 50);
    }
    document.body.classList.remove('resume-open');
    this.clock?.removeAttribute('aria-hidden');
    await Promise.all([this.fadePaper(false), wait(this.reduced ? 0 : RESUME_VIEW.fade)]);
    this.root.hidden = true;
    this.isOpen = false;
    // Back at its default for the next visit: no panel, no band, the top.
    this.dropPanel();
    this.setLocked(null);
    this.root.classList.remove('is-blurred');
    this.paper.inert = false;
    this.scene.setPaperPresent(true);
    this.paper.dispatchEvent(new CustomEvent('paperflipend', { detail: { red: this.fromRed } }));
    this.busy = false;
    (this.fromRed ? this.link : this.aboutLink)?.focus({ preventScroll: true, focusVisible: false });
  }

  // The paper shrinking a little and fading (`away`), or growing back into
  // place, either side up. The shrink adds to its pose (paper-pose.mjs), which
  // it keeps; the fade is its own, so it does not add up.
  async fadePaper(away) {
    this.paperAnimations?.forEach(animation => animation.cancel());
    this.paperAnimations = null;
    if (this.reduced) return;
    const scale = [{ transform: 'scale(1)' }, { transform: `scale(${RESUME_VIEW.shrink})` }];
    const fade = [{ opacity: 1 }, { opacity: 0 }];
    const options = { duration: RESUME_VIEW.swap, easing: 'cubic-bezier(.33, 0, .2, 1)', fill: away ? 'forwards' : 'none' };
    const animations = [
      this.paper.animate(away ? scale : scale.reverse(), { ...options, composite: 'add' }),
      this.paper.animate(away ? fade : fade.reverse(), options),
    ];
    if (away) this.paperAnimations = animations;
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  }

  // null: neither yet (the pages arriving); true: the locked pages and the
  // PIN; false: the resume, with its count and download in the bar.
  setLocked(locked) {
    this.root.classList.toggle('is-locked', locked === true);
    this.root.classList.toggle('is-unlocked', locked === false);
    this.tools.inert = locked !== false;
    this.download.disabled = !this.bytes;
    this.updateEdges();
  }

  // What each sheet shows now: its teaser page or the resume's canvas.
  sources() {
    return [...this.root.querySelectorAll('.resume-sheet')].map(sheet => sheet.querySelector('.resume-page'));
  }

  // The roller laid out for the pages as they lie, and its strips painted
  // from what they show.
  roll() {
    this.roller.setup(this.sources(), { reduced: this.reduced });
    this.updateEdges();
  }

  // The exploration sheet's edge veils: the top one once the pages have
  // scrolled under the bar, the bottom one while there is more below.
  makeEdges() {
    const [{ blur, split }] = WORKS_VEIL.layers;
    const filter = aberrationFilter('works-aberration-0', split);
    for (const edge of ['top', 'bottom']) {
      const veil = Object.assign(document.createElement('div'), { className: 'resume-edge-veil' });
      veil.setAttribute('aria-hidden', 'true');
      veil.dataset.edge = edge;
      veil.style.backdropFilter = `blur(${blur}px)${filter ? ' url(#works-aberration-0)' : ''}`;
      veil.style.webkitBackdropFilter = `blur(${blur}px)`;
      this.root.querySelector('.resume-nav').before(veil);
    }
  }

  updateEdges() {
    const at = this.scroller.scrollTop, max = this.scroller.scrollHeight - this.scroller.clientHeight;
    const above = at > 2, below = at < max - 2;
    if (above !== this.scrolled) this.root.classList.toggle('is-scrolled', this.scrolled = above);
    if (below !== this.more) this.root.classList.toggle('has-more', this.more = below);
  }

  lock() {
    this.setLocked(true);
    this.pin = mountPinPanel({
      title: 'resume', prompt: PROMPT, parent: this.root,
      // Drawn, and put in the teaser's place under the blur, while "unlocked
      // for a day" shows and nothing moves, so the blur clears onto finished
      // pages.
      // The PDF is fetched at once, and drawn once the digits have settled
      // (project-pin.mjs, 440 ms), so their moment runs clean.
      onCorrect: () => {
        dispatchEvent(new Event('works-pass'));
        this.drawing = null;
        this.unlocking = this.live({ before: wait(this.reduced ? 0 : RESUME_VIEW.settled) }).then(drawing => this.takeOver(drawing));
        this.unlocking.catch(() => {});
      },
      onUnlock: () => this.unlocked(),
    });
    requestAnimationFrame(() => this.placeVeil());
    // Once the pages have settled, the panel rises and the veil's blur grows
    // up from the bottom behind it.
    const settled = this.reduced ? 0 : Math.max(0, this.openedAt + RESUME_VIEW.settle - performance.now());
    this.pin.arrive(settled);
    clearTimeout(this.veilTimer);
    this.veilTimer = setTimeout(() => { if (this.isOpen && this.root.classList.contains('is-locked')) this.veilTo(1, RESUME_VIEW.veilIn); }, settled);
    // pdf.js and its worker get ready while the PIN is typed, so the right
    // one only has the pages to draw.
    (window.requestIdleCallback ?? (run => setTimeout(run, 400)))(() => loadPdfjs().catch(() => {}), { timeout: 1200 });
    setTimeout(() => {
      if (this.isOpen && this.pin) this.pin.element.querySelector('.otp-input')?.focus({ preventScroll: true });
    }, settled);
  }

  // The veil reaches from the bottom to a little above the panel and the
  // line under it, as the exploration sheet's reaches to its first line.
  placeVeil() {
    const top = this.pin?.element.getBoundingClientRect().top;
    if (top != null) this.root.style.setProperty('--resume-veil-height', `${Math.round(innerHeight - top + RESUME_VIEW.veilAbove)}px`);
  }

  // Under the blur, the resume takes the teaser's place, its rolled edges
  // too: nothing of the change can be seen.
  async takeOver(drawing) {
    if (!drawing?.parts || !this.isOpen) return drawing;
    await this.pages.show(drawing, 'now');
    this.roll();
    return drawing;
  }

  // The right PIN: as the panel and the veil leave, the blur clears from the
  // resume, put in place while "unlocked for a day" showed (onCorrect); its
  // text and links follow once it stands sharp.
  async unlocked() {
    let drawing;
    try {
      drawing = await (this.unlocking ?? this.live().then(result => this.takeOver(result)));
    } catch (problem) {
      console.warn('Resume could not be drawn:', problem);
      return this.unsupported();
    }
    this.unlocking = null;
    if (!drawing?.parts) return this.failed();
    if (!this.isOpen) return;
    this.pin = null;
    this.setLocked(false);
    this.root.classList.remove('is-blurred');
    this.veilTo(0, RESUME_VIEW.veilOut);
    this.layersLater(drawing, RESUME_VIEW.unblur);
  }

  save() {
    if (!this.bytes) return;
    const url = URL.createObjectURL(new Blob([this.bytes], { type: 'application/pdf' }));
    const anchor = Object.assign(document.createElement('a'), { href: url, download: FILE, hidden: true });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  dropPanel() {
    this.pin?.element.remove();
    this.pin = null;
  }

  failed() {
    this.dropPanel();
    this.veilTo(0, RESUME_VIEW.veilOut);
    this.setLocked(null);
    this.root.classList.remove('is-blurred');
    this.pages.note('couldn’t load the resume', { label: 'try again', run: () => location.reload() });
  }

  unsupported() {
    this.dropPanel();
    this.veilTo(0, RESUME_VIEW.veilOut);
    this.setLocked(this.bytes ? false : null);
    this.root.classList.remove('is-blurred');
    this.pages.note('this browser can’t show the resume here', this.bytes && { label: 'download the pdf', run: () => this.save() });
  }

  // The exploration sheet's own veil (gallery.mjs WORKS_VEIL): a blur that
  // parts the colours, as a lens does at its rim, strongest at the bottom
  // edge, with its own filter so its parting can grow.
  makeVeil() {
    const [{ split }] = WORKS_VEIL.layers;
    this.veilFilter = aberrationFilter('resume-aberration', split);
    this.veilSplits = this.veilFilter ? [...this.veilFilter.querySelectorAll('feOffset')] : [];
    this.veilAmount = 0;
    this.setVeil(0);
  }

  // The veil at `amount`, 0 to 1: its blur, the parting of its colours and
  // its white lift, all growing together.
  setVeil(amount) {
    const [{ blur, split }] = WORKS_VEIL.layers;
    this.veilAmount = amount;
    const radius = `blur(${(blur * amount).toFixed(2)}px)`;
    this.veil.style.backdropFilter = amount > 0 ? radius + (this.veilFilter ? ' url(#resume-aberration)' : '') : 'none';
    this.veil.style.webkitBackdropFilter = amount > 0 ? radius : 'none';
    const [red, blue] = this.veilSplits;
    red?.setAttribute('dx', (-split * amount).toFixed(2));
    blue?.setAttribute('dx', (split * amount).toFixed(2));
    this.veil.style.setProperty('--veil', amount.toFixed(3));
    this.veil.classList.toggle('is-blurring', amount > 0);
  }

  // The veil's blur grows (or clears) progressively, eased in and out, rather
  // than appearing whole. Resolves once it gets there.
  veilTo(target, duration) {
    cancelAnimationFrame(this.veilFrame);
    const from = this.veilAmount;
    if (this.reduced || from === target || !duration) { this.setVeil(target); return Promise.resolve(); }
    return new Promise(resolve => {
      let start;
      const step = now => {
        start ??= now;
        const t = Math.min(1, (now - start) / duration);
        const eased = t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        this.setVeil(from + (target - from) * eased);
        if (t < 1) this.veilFrame = requestAnimationFrame(step);
        else resolve();
      };
      this.veilFrame = requestAnimationFrame(step);
    });
  }
}
