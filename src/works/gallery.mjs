import { GRID } from '../stitch/model.mjs';
import { PAPER_AWAY, PaperAway, followDelay } from '../paper/paper-away.mjs';
import { WORKS, EXPLORATION, clockLabel, fullCover, workHref, yearLabel } from '../content/works.mjs';
import { clockTextLayout } from '../clock/clock.mjs';
import { paperTarget, advancePaper } from '../paper/paper-motion.mjs';
import { transitionToProject } from './project-transition.mjs';
import { mountCloseup } from '../project/project-closeup.mjs';
import { STAMP, stampShape, stampOutline, createPostageStamp } from './postage-stamp.mjs';
import { WaxInteraction } from '../wax/wax-interaction.mjs';
import { CARD_GUARD, PHOTO_PARALLAX, placement, shelfAt } from './layout.mjs';
import { DITHER_LOCKED, DITHER_NONE, GLITCH, createGlitch, ditherPhotoBlob } from './dither.mjs';
import { isPhone } from '../shared/breakpoints.mjs';
import { clamp } from '../shared/math.mjs';
import { bitmapOf } from '../shared/bitmap.mjs';
import { SheetRoller, copiesOf, rollerRadius, rollsSmoothly } from './sheet-roller.mjs';

// The paper turns away using the first half of its own flip and is gone
// when edge-on; it returns through the second half, from the other side.
export const WORKS_MOTION = Object.freeze({ fade: 280 });
// Exploration's filter lies along the bottom, `edge` px up from the screen's
// edge (works.css).
export const WORKS_FILTER = Object.freeze({ edge: 16 });
// Wheel scrolling glides toward where the wheel has sent it.
export const WHEEL_GLIDE = 140;
// How far a pressed card gives, and the least time a press shows.
export const CARD_PRESS = Object.freeze({ scale: .97, hold: 120 });
// Each collection has its own view: selected works the `row`, sideways, and
// exploration the `sheet`, its stamps wrapped into lines that scroll down. On
// the sheet a line holds about `columns` 4:3 stamps for the screen's width.
// Changing filter, cards that go fade out over `leave` ms first. A card with only a short way to its
// new place glides there over `move` ms; one going further than `far` of the
// screen's diagonal, or coming from off screen, fades out where it was and
// settles in at its new place over `enter` ms, `stagger` ms after the last.
export const EXPLORATION_VIEW = Object.freeze({
  move: 560, leave: 180, enter: 380, stagger: 28, far: .28,
  // On the sheet, as many columns as `most`, down to `fewest`, as keep each
  // stamp at least `narrowest` px wide, so it stays clear to see; phones
  // always show `phone`.
  columns: { most: 4, fewest: 2, narrowest: 280, phone: 1 },
});

// The sheet coming in (its collection chosen, or the works opened onto it):
// line by line from the top, `line` ms apart and `across` ms along a line,
// none later than `latest` ms; each card settles over `settle` ms (works.css).
// The rolled edges come in after the last card in view, never before it;
// the filter comes in with the cards (works.css).
export const SHEET_ENTRANCE = Object.freeze({ line: 60, across: 25, latest: 260, settle: 440 });

// Each sheet card's delay in ms, by its line and its place along it, and
// when the last of those still in view (above `bottom`) starts.
export function sheetEntrance(lines, bottom, { line, across, latest } = SHEET_ENTRANCE) {
  const delays = new Map();
  let last = 0;
  lines.forEach(({ entries, y }, row) => entries.forEach((entry, column) => {
    const delay = Math.min(latest, row * line + column * across);
    delays.set(entry, delay);
    if (y < bottom) last = Math.max(last, delay);
  }));
  return { delays, last };
}

// How a card moves between two layouts, given where it was and where it is
// now (rects) and the screen: 'glide' a short way, 'settle' in at its new
// place, or 'none' when it ends out of sight.
export function cardMove(from, to, { width, height }, far = EXPLORATION_VIEW.far) {
  const seen = rect => rect && rect.width > 0 && rect.right > 0 && rect.left < width && rect.bottom > 0 && rect.top < height;
  if (!seen(to)) return 'none';
  if (!seen(from)) return 'settle';
  const distance = Math.hypot(from.left - to.left, from.top - to.top);
  return distance > Math.hypot(width, height) * far ? 'settle' : 'glide';
}

// Only a pointer that hovers glitches the cards; on a touch screen there is
// no glitch to ready.
const hovering = globalThis.matchMedia?.('(hover: hover)');

// Whether a photo decoded from its file uploads the very pixels its <img>
// does: measured so in Chromium, texel for texel, colour-managed covers too.
// Other engines are not measured, so there the glitch is not readied and a
// first hover uploads the <img>, as it always has.
const decodesAlike = () => Boolean(globalThis.navigator?.userAgentData?.brands?.some(brand => brand.brand === 'Chromium'));

// On phones the sheet's stamps keep this far, in px, from the screen's sides.
export const SHEET_PHONE_SIDE = 16;

// The veils at the sheet's top and bottom edges: each layer blurs by `blur`
// px, parts red and blue `split` px either way (Chromium), and fades out by
// `reach` of the band's depth, measured from the edge.
export const WORKS_VEIL = Object.freeze({
  layers: [{ blur: 5, split: 3, reach: 1 }],
});

// The parting of colours a veil's backdrop filter adds, as a lens does at its
// rim: red `split` px one way, blue the other. One SVG filter per id, made
// once; also the resume's (src/resume/resume-view.mjs). Only Chromium can
// filter what lies behind with one, so elsewhere this is null.
export function aberrationFilter(id, split) {
  if (!navigator.userAgentData?.brands?.some(brand => brand.brand === 'Chromium')) return null;
  const made = document.getElementById(id);
  if (made) return made;
  let defs = document.querySelector('.works-veil-filters');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    defs.setAttribute('class', 'works-veil-filters');
    defs.setAttribute('aria-hidden', 'true');
    document.body.append(defs);
  }
  const channel = (row, offset, name) => `<feColorMatrix in="SourceGraphic" type="matrix" values="${row}" result="${name}"/>`
    + (offset ? `<feOffset in="${name}" dx="${offset}" result="${name}"/>` : '');
  defs.insertAdjacentHTML('beforeend', `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`
    + channel('1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', -split, 'red')
    + channel('0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 0, 'green')
    + channel('0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', split, 'blue')
    + '<feBlend in="red" in2="green" mode="screen" result="rg"/><feBlend in="rg" in2="blue" mode="screen"/></filter>');
  return document.getElementById(id);
}
// A sheet of at least `least` stamps runs on round, endlessly: past its last
// line comes its first again, a line's gap apart as ever. It is laid out up
// to `copies` times over either way, about `reach` px in all, and the scroll
// is brought back toward the middle copy whenever it rests. Switched off for
// now (2026-11-07): its moving copies and ghosts cost the scroll frames on
// slower machines, and smoothness comes first. 10 brings it back.
export const SHEET_LOOP = Object.freeze({ least: Infinity, reach: 400000, copies: 24 });

// How many columns the sheet takes in `room` px with `gap` between them: the
// most that keep each at least `narrowest` px wide once rounded down to
// whole `step`s (perforations).
export function sheetColumns(room, gap, { most, fewest, narrowest, step = 1 } = EXPLORATION_VIEW.columns) {
  for (let count = most; count > fewest; count--) {
    if (Math.floor((room - gap * (count - 1)) / count / step) * step >= narrowest) return count;
  }
  return fewest;
}

// The tags of `works`, most used first, then by name, with their counts.
export function tagCounts(works) {
  const counts = new Map();
  for (const work of works) for (const tag of work.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// Wraps cards of `widths` into lines no wider than `room`, `gap` apart.
// Returns each line's card indices.
export function wrapLines(widths, room, gap) {
  const lines = [];
  let line = [], used = 0;
  widths.forEach((width, index) => {
    if (line.length && used + gap + width > room) { lines.push(line); line = []; used = 0; }
    used += (line.length ? gap : 0) + width;
    line.push(index);
  });
  if (line.length) lines.push(line);
  return lines;
}


// A card's width when it keeps its photo's own shape (exploration, which
// gives each piece's size): the window takes the photo's aspect at the row's
// shared height, and the paper keeps its margin, in whole perforations.
export function ownShapeWidth(aspect, height, inset, perf) {
  return Math.max(perf * 4, Math.round(((height - inset * 2) * aspect + inset * 2) / perf) * perf);
}

// A piece that gives its own size (exploration) keeps its shape, and its
// card shows the picture alone: no number, title or tags.
const ownShape = work => work.width > 0 && work.height > 0;

export class WorksGallery {
  constructor(root, { scene, paper, frontSeal, motionPreference, collections = { works: WORKS, exploration: EXPLORATION } }) {
    this.root = root;
    this.scene = scene;
    this.paper = paper;
    this.paperAway = new PaperAway(paper, motionPreference);
    this.frontSeal = frontSeal;
    this.motionPreference = motionPreference;
    this.scroller = root.querySelector('.works-scroll');
    this.wall = root.querySelector('.works-wall');
    this.isOpen = false;
    this.busy = false;
    this.lifetime = new AbortController();
    const { signal } = this.lifetime;
    this.active = null;
    this.relayouts = 0;
    this.collections = collections;
    this.collection = this.laidOut = 'works';
    // The tag exploration is filtered to, kept for the visit. Selected works
    // has no filter.
    this.explorationFilter = null;
    this.items = collections.works.map((work, index) => this.createItem(work, index));
    this.shown = this.items;
    // Each collection's cards are made once and kept.
    this.built = { works: this.items };
    // Protected work's covers dither coarser until the visitor has the PIN;
    // a project page tells the row when it is entered.
    this.passed = false;
    this.passChecked = this.checkPass();
    addEventListener('works-pass', () => { this.passChecked = this.checkPass(); }, { signal });
    // Along the top: the way back to the paper, and a toggle between the
    // selected works and exploration.
    this.nav = root.querySelector('.works-nav');
    this.nav.querySelector('.works-nav-back').addEventListener('click', () => this.close());
    this.toggles = [...this.nav.querySelectorAll('[data-collection]')];
    for (const toggle of this.toggles) toggle.addEventListener('click', () => this.show(toggle.dataset.collection));
    // The chosen collection's ink pill slides between them, as the view
    // switch's does.
    this.togglePill = Object.assign(document.createElement('span'), { className: 'works-nav-toggle-pill' });
    this.togglePill.setAttribute('aria-hidden', 'true');
    this.toggles[0].parentElement.prepend(this.togglePill);
    // Beside it the row or the sheet, and under it a filter by tag.
    this.makeFilter();
    this.veils = this.makeVeils();
    // Above the clock: a dot per stamp, the current one filled; a dot glides
    // the row to its stamp.
    this.dots = Object.assign(document.createElement('nav'), { className: 'works-dots' });
    this.dots.setAttribute('aria-label', 'Works');
    root.append(this.dots);
    frontSeal.addEventListener('click', () => this.open());
    // Up close, Escape and the wheel are the close-up's.
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !this.isOpen || this.closeupOpen) return;
      if (this.filterOpen) { this.closeFilter({ focus: true }); return; }
      this.close();
    }, { signal });
    addEventListener('popstate', () => {
      if (location.pathname.startsWith('/work/')) return;
      if ((location.hash === '#works') !== this.isOpen) location.hash === '#works' ? this.open({ history: false }) : this.close({ history: false });
    }, { signal });
    addEventListener('resize', () => {
      if (!this.isOpen) return;
      this.layout();
    }, { signal });
    // The row scrolls sideways, freely. It lies over the cloth without taking
    // its pointer, so the wheel is passed on and the cloth stays stitchable.
    // The sheet takes the pointer and scrolls natively; only a wheel over the
    // bar is passed on to it here.
    // A wheel listener that may cancel scrolling makes the browser wait for
    // the page before it scrolls, wherever it listens; so the page listens
    // over the whole window only while the row is shown, and on the sheet
    // only over the bar and the filter (syncWheel).
    this.onWheel = event => {
      if (!this.isOpen || this.closeupOpen || this.filterOpen) return;
      if (this.sheet !== (event.currentTarget !== window)) return;
      event.preventDefault();
      const delta = this.sheet ? event.deltaY || event.deltaX : Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      this.glideBy(event.deltaMode === 1 ? delta * 40 : delta);
    };
    this.lifetime.signal.addEventListener('abort', () => removeEventListener('wheel', this.onWheel));
    for (const bar of [this.nav, this.filterDock]) bar.addEventListener('wheel', this.onWheel, { passive: false, signal });
    // A native scroll (a swipe, or the keyboard) is drawn in the same frame loop.
    this.scroller.addEventListener('scroll', () => {
      this.paint();
      this.updateVeils();
      // An endless sheet comes back round toward its middle copy once it rests.
      clearTimeout(this.recentring);
      if (this.loop) this.recentring = setTimeout(() => this.recentre(), 220);
    }, { passive: true });
    // The hand takes over from any glide: the browser scrolls the sheet now.
    this.scroller.addEventListener('touchstart', () => { this.touching = true; this.gliding = false; }, { passive: true });
    this.scroller.addEventListener('wheel', () => { if (this.sheet) this.gliding = false; }, { passive: true });
    this.scroller.addEventListener('keydown', event => {
      if (this.sheet && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) this.gliding = false;
    });
    for (const type of ['touchend', 'touchcancel']) this.scroller.addEventListener(type, () => { this.touching = false; }, { passive: true });
    // The cards near the sheet's edges, rolled.
    this.roller = new SheetRoller(root);
  }

  get reduced() { return this.motionPreference.matches; }
  // On the sheet, which scrolls down rather than sideways.
  // Selected works lie in a row, exploration on a sheet: the view of the
  // collection laid out, which changes once the old cards have gone.
  get view() { return this.laidOut === 'exploration' ? 'sheet' : 'row'; }
  get sheet() { return this.view === 'sheet'; }
  get filter() { return this.collection === 'exploration' ? this.explorationFilter : null; }
  set filter(tag) { this.explorationFilter = tag; }
  get scrollAxis() { return this.sheet ? 'scrollTop' : 'scrollLeft'; }
  get scrollMax() { return this.sheet ? this.scroller.scrollHeight - this.scroller.clientHeight : this.scroller.scrollWidth - this.scroller.clientWidth; }
  get closeupOpen() { return Object.values(this.closeups ?? {}).some(closeup => closeup.isOpen()); }
  get stacked() { return isPhone(innerWidth); }

  // Removes the gallery's window and document listeners.
  destroy() {
    this.lifetime.abort();
  }

  createItem(work, index) {
    const item = document.createElement('li');
    item.className = 'works-item';
    item.dataset.work = work.id;
    item.dataset.shelf = shelfAt(index);
    item.style.setProperty('--i', index);
    const link = document.createElement('a');
    link.className = 'works-link';
    const href = workHref(work);
    if (href) link.href = href;
    // A piece without a page opens up close, so it is a button; anything
    // else without a page does nothing.
    else if (ownShape(work)) link.setAttribute('role', 'button');
    else link.setAttribute('aria-disabled', 'true');
    link.tabIndex = 0;
    link.setAttribute('aria-label', [work.title, ...work.tags, yearLabel(work), work.passwordProtected && 'passcode protected'].filter(Boolean).join(', '));
    // The photograph fills the stamp, over its paper.
    const frame = document.createElement('span');
    frame.className = 'works-frame';
    const picture = document.createElement('span');
    picture.className = 'works-window';
    const image = new Image();
    image.decoding = 'async';
    image.alt = work.alt;
    image.draggable = false;
    picture.append(image);
    // The card shows its photo dithered at the window's size (dither.mjs).
    // The source loads alongside and stays off the page; where its pixels
    // cannot be read, the card shows it as it is.
    const photo = new Image();
    photo.crossOrigin = 'anonymous';
    photo.decoding = 'async';
    photo.addEventListener('error', () => { image.src = work.preview ?? work.image; }, { once: true });
    photo.src = work.preview ?? work.image;
    // The stamp's paper is drawn once the card's size is known.
    const stamp = createPostageStamp(`works-paper-${work.id}`, 'works-stamp');
    // Its place in the collection, blind-embossed into the photo's bottom
    // left: on the frame itself, so it can blend with the photo.
    frame.append(picture, stamp);
    if (!ownShape(work)) {
      const number = Object.assign(document.createElement('span'), { className: 'works-number', textContent: String(index + 1).padStart(2, '0') });
      number.setAttribute('aria-hidden', 'true');
      frame.append(number, cardText(work));
    }
    // Work with a page shows a wax "details" seal in the middle of its photo
    // on hover: the homepage's seal and its light, without its wax-flow entrance.
    let seal = null;
    if (href) {
      const element = Object.assign(document.createElement('span'), { className: 'works-seal works-details' });
      element.setAttribute('aria-hidden', 'true');
      element.innerHTML = '<img src="/assets/works-wax-seal.webp" width="768" height="280" alt="" draggable="false" />'
        + '<span class="works-seal-label">details</span>';
      frame.append(element);
      seal = { element, wax: new WaxInteraction(element, this.motionPreference, { entrance: false, relit: true }) };
    }
    link.append(frame);
    // Work behind a passcode says so on a small tag just below the frame.
    if (work.passwordProtected) {
      const tag = Object.assign(document.createElement('span'), { className: 'works-protected', textContent: 'passcode protected' });
      tag.setAttribute('aria-hidden', 'true');
      link.append(tag);
    }
    item.append(link);
    this.wall.append(item);
    const entry = { work, index, item, link, frame, picture, image, photo, dithered: null, stamp, seal, ownShape: ownShape(work), parallax: 0, pressed: false, pose: paperTarget(), pointer: { x: -1e4, y: -1e4 } };
    image.addEventListener('load', () => {
      this.roller?.refresh(entry);
      this.paint();
    });
    photo.addEventListener('load', () => this.ditherCard(entry));
    link.addEventListener('pointermove', event => {
      entry.pointer = { x: event.clientX, y: event.clientY };
      this.glitch(entry, event);
      this.paint();
    });
    // Pressing a card flattens it, like the paper on the homepage but deeper,
    // as a stamp gives under a thumb. A quick tap still shows: the press
    // holds CARD_PRESS.hold ms at the least.
    let pressedAt = 0, letGo;
    const press = pressed => event => {
      if (event.pointerType === 'mouse' && event.button !== 0 && pressed) return;
      clearTimeout(letGo);
      if (pressed) pressedAt = performance.now();
      const set = () => { entry.pressed = pressed; this.paint(); };
      if (pressed || !entry.pressed) set();
      else letGo = setTimeout(set, Math.max(0, CARD_PRESS.hold - (performance.now() - pressedAt)));
    };
    link.addEventListener('pointerdown', press(true));
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) link.addEventListener(type, press(false));
    link.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') this.activate(entry); });
    link.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') { this.activate(null); this.unglitch(entry); } });
    link.addEventListener('focus', () => {
      if (!link.matches(':focus-visible')) return;
      // Its place among the cards shown, which a filter may thin.
      this.goTo(this.shown.indexOf(entry));
      this.activate(entry);
    });
    // A piece without a page opens up close from the keyboard too.
    link.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && link.getAttribute('role') === 'button') this.choose(entry, event);
    });
    link.addEventListener('blur', () => { if (this.active === entry) this.activate(null); });
    link.addEventListener('click', event => this.choose(entry, event));
    return entry;
  }

  // `instant` opens it already laid out, the paper away and the cards in place.
  async open({ history = true, instant = false } = {}) {
    if (this.isOpen || this.busy) return;
    this.busy = true;
    // The details seals wake while the row is still out of sight, so the
    // first frame shown carries nothing of their time away.
    this.sealsAway(false);
    if (history && location.hash !== '#works') window.history.pushState({ works: true }, '', '#works');
    this.scene.setPaperPresent(false);
    this.scene.setBirdAway?.(true, { immediate: instant });
    this.paper.inert = true;
    this.paper.dispatchEvent(new CustomEvent('paperflipstart'));
    // The paper shrinks, blurs and fades (paper-away.mjs), and the cards
    // follow it out a moment later, as the resume's pages do.
    const follow = instant || this.reduced ? 0 : followDelay();
    if (instant) this.paper.style.visibility = 'hidden';
    else this.paperAway.away().then(() => { if (this.isOpen) this.paper.style.visibility = 'hidden'; });
    this.isOpen = true;
    this.root.hidden = false;
    document.body.classList.add('works-open');
    this.syncClock();
    this.syncWheel();
    this.placeTogglePill();
    this.placeTogglePill();
    this.layout();
    this.toStart();
    const entering = this.stageEntrance();
    this.paint();
    // Lay the cards out, then let them settle onto the cloth in turn.
    if (instant) {
      this.root.classList.add('is-instant', 'is-open');
      requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('is-instant')));
    } else setTimeout(() => { if (this.isOpen) this.root.classList.add('is-open'); }, follow);
    this.keepPainting(entering + follow);
    this.busy = false;
    (this.shown.find(entry => workHref(entry.work)) ?? this.shown[0])?.link.focus({ preventScroll: true, focusVisible: false });
    // A project opened at its own address shows over the row; its glitch is
    // readied once the visitor is back on it (departing).
    if (!instant) this.readyGlitch(this.shown.length * 80 + 700);
  }

  // A project's own address, opened directly: the row opens at once on the
  // work's card, and the project shows over it as though the card had just
  // been chosen, so "back" flies home as ever. `shown` runs once it covers
  // the page (at once if there is no such work); the project's entrance waits
  // for the promise it returns.
  async openProject(id, shown) {
    await this.open({ history: false, instant: true });
    const index = this.shown.findIndex(entry => entry.work.id === id && workHref(entry.work));
    if (index < 0) { shown(); return; }
    const entry = this.shown[index];
    this.jumpTo(index);
    this.updateRow();
    this.paint();
    // The card's dithered photo flies home with the stamp; wait a moment for it.
    for (let wait = 0; wait < 40 && !entry.image.src.startsWith('blob:'); wait++) await new Promise(resolve => setTimeout(resolve, 50));
    let showing = false;
    await transitionToProject(this, entry, { seal: false, arrived: () => { showing = true; return shown(); } });
    if (!showing) shown();
  }

  async close({ history = true } = {}) {
    if (!this.isOpen || this.busy) return;
    this.busy = true;
    this.activate(null);
    this.closeFilter();
    // The clock comes back as the cards leave; from the sheet, once they
    // have gone, as the paper turns back (below).
    const fromSheet = document.body.classList.contains('works-sheet');
    if (!fromSheet) this.syncClock({ away: false });
    if (history && location.hash === '#works') {
      if (window.history.state?.works) window.history.back();
      else window.history.replaceState(null, '', location.pathname + location.search);
    }
    this.root.classList.remove('is-open');
    this.keepPainting(WORKS_MOTION.fade + 100);
    // The paper grows back into place as the cards leave (paper-away.mjs).
    this.paper.style.visibility = '';
    this.scene.restPaper?.();
    this.scene.relightPaper?.();
    this.scene.setBirdAway?.(false);
    if (fromSheet) this.syncClock({ away: false, home: true });
    await Promise.all([this.paperAway.back(), new Promise(resolve => setTimeout(resolve, this.reduced ? 0 : WORKS_MOTION.fade))]);
    this.root.hidden = true;
    this.isOpen = false;
    // Out of sight, the seals rest until the row opens again, and the
    // photos readied for the glitch are let go.
    this.sealsAway(true);
    this.dropGlitch();
    this.syncWheel();
    this.paper.inert = false;
    this.scene.setPaperPresent(true);
    document.body.classList.remove('works-open');
    this.paper.dispatchEvent(new CustomEvent('paperflipend', { detail: { red: false } }));
    this.busy = false;
    this.frontSeal.focus({ preventScroll: true, focusVisible: false });
  }

  // Swaps the row for another collection: the cards fade out, the new ones
  // are laid out from the start of the row and settle in, in turn.
  async show(collection) {
    if (collection === this.collection || this.busy || !this.collections[collection]) return;
    this.busy = true;
    this.collection = collection;
    for (const toggle of this.toggles) toggle.setAttribute('aria-pressed', String(toggle.dataset.collection === collection));
    this.activate(null);
    this.closeFilter();
    this.root.classList.toggle('is-exploration', collection === 'exploration');
    this.placeTogglePill();
    if (collection === 'exploration') this.renderFilter();
    this.root.classList.add('is-swapping');
    // Bound for the sheet, the clock leaves with the old cards (the dots too,
    // works.css); bound for the row, it comes back as the new cards arrive.
    if (collection === 'exploration' && this.isOpen) this.syncClock({ away: true });
    this.keepPainting(WORKS_MOTION.fade + 100);
    await new Promise(resolve => setTimeout(resolve, this.reduced ? 0 : WORKS_MOTION.fade));
    for (const entry of this.items) entry.item.remove();
    this.items = this.built[collection] ??= this.collections[collection].map((work, index) => this.createItem(work, index));
    for (const entry of this.items) this.wall.append(entry.item);
    this.gliding = false;
    this.laidOut = collection;
    this.root.classList.toggle('is-sheet', this.sheet);
    this.syncClock();
    this.syncWheel();
    // A card hovered on its way out leaves no label behind.
    this.activate(null);
    if (this.clockLabelled) {
      this.clockLabelled = false;
      this.scene.setMessage('');
    }
    this.layout();
    this.toStart();
    this.updateVeils();
    const entering = this.stageEntrance();
    // Let the new cards be drawn hidden once, so they arrive in turn.
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('is-swapping')));
    this.keepPainting(entering);
    this.busy = false;
    this.readyGlitch(this.shown.length * 80 + 700);
  }

  // Sets when each card comes in, and returns how long they all take, in ms.
  // The row's cards keep their turn in it (works.css); the sheet's come in
  // line by line, the rolled edges after the last card in view.
  stageEntrance() {
    if (!this.sheet) {
      this.root.style.removeProperty('--roller-enter');
      return this.shown.length * 80 + 700;
    }
    const { delays, last } = sheetEntrance(this.sheetLines, this.curl?.bottom ?? innerHeight);
    for (const [entry, delay] of delays) entry.item.style.setProperty('--enter', `${delay}ms`);
    this.root.style.setProperty('--roller-enter', `${last}ms`);
    return Math.max(...delays.values(), 0) + SHEET_ENTRANCE.settle + 100;
  }


  // `quiet` only measures and places, for warm() below: no dithering yet,
  // and no frame painted while the row is out of sight.
  // `dither: false` leaves the cards' dithers for later (relayout does them
  // once its cards have moved).
  layout({ quiet = false, dither = true } = {}) {
    const view = this.scene.view;
    const pitch = GRID * view.scale;
    const width = innerWidth, height = innerHeight, stacked = this.stacked;
    const snapRow = (y, round = Math.ceil) => view.y + round((y - view.y) / pitch) * pitch;
    const snapCol = (x, round = Math.round) => view.x + round((x - view.x) / pitch) * pitch;

    // Everything measured first, then everything written: a measure taken
    // between writes would have the browser lay the page out again for it.
    // None of these depends on what is written below (the cards and the
    // seals' size live apart from the homepage seal, the bar and the filter).
    const label = this.frontSeal.querySelector('.works-seal-label');
    const sealWidth = this.frontSeal.offsetWidth, labelSize = getComputedStyle(label).fontSize;
    const barBottom = this.nav.getBoundingClientRect().bottom;
    const dock = this.sheet ? this.filterDock.offsetHeight : 0;

    // The details seals match the homepage's seal, size and lettering.
    this.root.style.setProperty('--seal-width', `${sealWidth}px`);
    this.root.style.setProperty('--seal-label-size', labelSize);

    const clockTop = view.y + (Math.floor((height - view.y) / pitch) - (stacked ? 21 : 7)) * pitch;
    // Only the cards the filter keeps are laid out; the rest are hidden.
    const shown = this.filter ? this.items.filter(entry => entry.work.tags.includes(this.filter)) : this.items;
    for (const entry of this.items) entry.item.hidden = !shown.includes(entry);
    this.shown = shown;
    // Cards lean to the top or the bottom of the space between the top bar
    // and the clock, each at its own height there; all share one size.
    const top = snapRow(barBottom + (stacked ? 16 : 24));
    // The sheet (exploration) runs down to the screen's bottom, where its
    // filter lies (WORKS_FILTER.edge px up); the row stops above the clock.
    const floor = this.sheet ? height - WORKS_FILTER.edge - dock : clockTop;
    if (this.sheet) {
      this.layoutSheet({ top, bar: barBottom, floor, pitch, stacked, snapCol, quiet, dither });
      return;
    }
    // The dots sit three rows above the clock, and the stamps
    // stop three rows above the dots, so the space above the dots matches
    // the space below.
    if (this.dotsFor !== shown) this.renderDots();
    this.dots.style.top = `${floor - 3 * pitch}px`;
    this.scroller.style.removeProperty('top');
    this.scroller.style.removeProperty('bottom');
    this.loop = this.curl = null;
    this.roller.setup();
    this.roller.clearGhosts();
    const bottom = snapRow(floor - 6 * pitch, Math.floor);
    const ratio = STAMP.window;
    const available = bottom - top;
    // Size guard: a share of the screen's width, but never taller than two
    // rows allow and never smaller than a readable card.
    // Phones and tablets use one fixed card size; wider screens scale it.
    const upright = !stacked && height > width;
    const fixed = stacked ? CARD_GUARD.phone : width <= CARD_GUARD.tabletUpTo ? CARD_GUARD.tablet : null;
    // The stamp measures whole perforations, so its holes fall on the cloth's.
    const perf = STAMP.perf * pitch;
    const w = Math.round((fixed ?? Math.max(CARD_GUARD.min, Math.min(width * CARD_GUARD.share, available * CARD_GUARD.tallest * ratio))) / perf) * perf;
    // The paper's height follows its 4:3 window, to the nearest perforation.
    const inset = Math.round(perf * STAMP.margin);
    const h = Math.round(((w - inset * 2) / ratio + inset * 2) / perf) * perf;
    // Every card shares one height. Works share one width too; a piece that
    // gives its own size (exploration) keeps its shape, whole, with no room
    // to slide (ownShapeWidth). The photo fills the whole stamp, cut to its
    // perforations, over the paper; the text keeps to where the paper's
    // margin would be.
    this.window = stampShape(w, h, perf);
    const outlines = new Map();
    const outlineOf = width => outlines.get(width) ?? outlines.set(width, stampOutline(width, h, perf)).get(width);
    for (const entry of shown) {
      entry.w = entry.ownShape ? ownShapeWidth(entry.work.width / entry.work.height, h, this.window.inset, perf) : w;
      const outline = outlineOf(entry.w);
      entry.stamp.setAttribute('viewBox', `0 0 ${entry.w} ${h}`);
      entry.stamp.lastChild.setAttribute('d', outline);
      entry.picture.style.clipPath = `path('${outline}')`;
      entry.frame.style.setProperty('--inset', `${this.window.inset}px`);
      if (entry.ownShape) entry.frame.style.setProperty('--photo-overscan', '1');
      entry.frame.style.height = `${h}px`;
    }
    // Upright screens keep the two rows in a band near the middle, rather
    // than at the far top and bottom of a tall space.
    const band = upright ? Math.min(available, h * CARD_GUARD.uprightBand) : available;
    const bandTop = snapRow(top + (available - band) / 2, Math.round);
    const room = Math.max(0, band - h);
    const left = snapCol(stacked ? 24 : Math.max(48, width * .06), Math.round);
    let x = left, previous = null;
    this.cards = [];
    shown.forEach((entry, index) => {
      const cw = entry.w;
      // The last two cards close the row with a zig-zag rather than half a
      // pair: each takes the shelf opposite the card before it, out at that
      // shelf's far edge.
      const closing = Boolean(previous) && index >= shown.length - 2;
      const shelf = closing ? (previous.shelf === 'top' ? 'bottom' : 'top') : shelfAt(index);
      const { lift, shift } = placement(index);
      entry.item.dataset.shelf = shelf;
      // Opposite shelves tuck into each other; the same shelf keeps apart.
      if (previous) x += previous.w * (shelf === previous.shelf ? 1.06 : .84) + (shift - .5) * w * .12;
      // The first card holds its place; the rest settle a little lower,
      // into the room below, except the closing pair at the edges.
      const settle = index && !closing ? available * CARD_GUARD.settle : 0;
      const reach = closing ? 0 : room * lift * .3;
      let y = shelf === 'top' ? bandTop + reach + settle : bandTop + band - h - reach;
      // A passcode label hangs below its stamp and counts as part of it.
      const tail = entry.work.passwordProtected ? CARD_GUARD.label : 0;
      y = snapRow(clamp(y, top, bottom - h - tail), Math.floor);
      // On the cloth's grid, like every stitch.
      x = snapCol(x, Math.round);
      // Overlap guard: a card never covers one placed before it. If it would,
      // it first slides along its shelf, down for the bottom shelf and up for
      // the top, just far enough to clear, where the room allows; so it stays
      // tucked under or over its neighbour. Only then does it move right
      // until there is a clear gap.
      const lowest = snapRow(bottom - h - tail, Math.floor), highest = top;
      for (let moved = true; moved;) {
        moved = false;
        for (const other of this.cards) {
          const overlaps = x < other.x + other.w + CARD_GUARD.gap && other.x < x + cw + CARD_GUARD.gap
            && y < other.y + other.h + other.tail + CARD_GUARD.gap && other.y < y + h + tail + CARD_GUARD.gap;
          if (!overlaps) continue;
          const below = snapRow(other.y + other.h + other.tail + CARD_GUARD.gap, Math.ceil);
          const above = snapRow(other.y - CARD_GUARD.gap - tail - h, Math.floor);
          if (shelf === 'bottom' && below <= lowest) y = below;
          else if (shelf === 'top' && above >= highest) y = above;
          else x = snapCol(other.x + other.w + CARD_GUARD.gap, Math.ceil);
          moved = true;
        }
      }
      Object.assign(entry.item.style, { left: `${x}px`, top: `${y}px`, width: `${cw}px` });
      previous = { x, y, w: cw, h, tail, shelf };
      this.cards.push(previous);
    });
    const end = x + previous.w;
    // The row ends with the same margin it starts with.
    this.wall.style.width = `${end + left}px`;
    this.wall.style.height = `${height}px`;
    if (quiet) return;
    if (dither) for (const entry of shown) this.ditherCard(entry);
    this.paint();
  }

  // The sheet: the same stamps, at one height, wrapped into lines centred
  // across the screen, filling it from under the bar and scrolling down.
  layoutSheet({ top, bar, floor, pitch, stacked, snapCol, quiet, dither }) {
    const width = innerWidth, shown = this.shown;
    // The veils reach from each edge as deep as the first line starts.
    for (const veil of this.veils) veil.style.setProperty('--veil-height', `${top}px`);
    // The sheet fills the screen: its first line starts under the bar, and
    // the stamps scroll up under the bar's solid pills and off the bottom
    // edge, where the clock was.
    this.scroller.style.removeProperty('top');
    this.scroller.style.removeProperty('bottom');
    const perf = STAMP.perf * pitch, inset = Math.round(perf * STAMP.margin);
    // On phones the stamps keep exactly SHEET_PHONE_SIDE px from the screen's
    // sides, one to a line, sized to fit rather than to whole perforations.
    // Wider screens keep to the holes.
    const exact = stacked;
    const side = exact ? SHEET_PHONE_SIDE : snapCol(Math.max(48, width * .06), Math.round);
    const room = width - side * 2;
    const gap = Math.max(pitch, Math.round((stacked ? 14 : 28) / pitch) * pitch);
    const { columns } = EXPLORATION_VIEW;
    const count = stacked ? columns.phone : sheetColumns(room, gap, { ...columns, step: perf });
    // One size for every card: a 4:3 stamp filling a column's width. Wider
    // screens round its width down to whole perforations, so a line never
    // runs past the room, and its height to the nearest.
    const column = (room - gap * (count - 1)) / count;
    const cardWidth = exact ? column : Math.floor(column / perf) * perf;
    const h = exact ? (column - inset * 2) / STAMP.window + inset * 2
      : Math.max(perf * 4, Math.round(((cardWidth - inset * 2) / STAMP.window + inset * 2) / perf) * perf);
    this.window = stampShape(Math.round(column / perf) * perf, h, perf);
    const outlines = new Map();
    const outlineOf = w => outlines.get(w) ?? outlines.set(w, stampOutline(w, h, perf)).get(w);
    for (const entry of shown) {
      // Every stamp on the sheet takes the 4:3 window, a piece of another
      // shape filling it as a cover does; up close it shows whole again.
      const own = ownShape(entry.work);
      const aspect = STAMP.window;
      entry.w = exact ? Math.min(room, (h - inset * 2) * aspect + inset * 2) : cardWidth;
      const outline = outlineOf(entry.w);
      entry.stamp.setAttribute('viewBox', `0 0 ${entry.w} ${h}`);
      entry.stamp.lastChild.setAttribute('d', outline);
      entry.picture.style.clipPath = `path('${outline}')`;
      entry.frame.style.setProperty('--inset', `${inset}px`);
      if (own) entry.frame.style.setProperty('--photo-overscan', '1');
      entry.frame.style.height = `${h}px`;
    }
    // Half a pixel's leeway, so exact widths that just fill a line keep to it.
    const lines = wrapLines(shown.map(entry => entry.w), room + .5, gap);
    // Lines sit a whole number of stitches apart, from under the bar, so at
    // rest every stamp is on the holes.
    const lineGap = Math.round(gap / pitch) * pitch;
    // A passcode label hangs under its stamp; its line leaves it room.
    const tailOf = line => line.some(index => shown[index].work.passwordProtected) ? Math.ceil(CARD_GUARD.label / pitch) * pitch : 0;
    // A sheet of enough stamps (SHEET_LOOP) starts just under the bar and runs
    // on round endlessly, over the roller at either edge. Fewer, it scrolls
    // if it must, from under the bar to as much room after its last line, so
    // that line rests flat at the end as the first does at the start; or, if
    // it fits, it sits centred between the bar and the filter, never nearer it
    // than a scrolling one starts, flat and still. Whole stitches on wider
    // screens.
    const block = lines.reduce((sum, line) => sum + h + tailOf(line), 0) + lineGap * (lines.length - 1);
    const loops = shown.length >= SHEET_LOOP.least;
    const scrolls = loops || top + block + top > innerHeight;
    // Where the scroll was in an endless sheet, as a share of one time round.
    const was = this.loop, phase = was ? (((this.scroller.scrollTop - was.base) % was.period) + was.period) % was.period / was.period : 0;
    const middle = bar + (floor - bar - block) / 2;
    const start = scrolls ? top : Math.max(top, exact ? middle : bar + Math.round((middle - bar) / pitch) * pitch);
    let y = start;
    this.cards = new Array(shown.length);
    // Each line's cards, where it lies and how tall it is, for the roller.
    this.sheetLines = [];
    for (const line of lines) {
      const widths = line.reduce((sum, index) => sum + shown[index].w, 0);
      const lineWidth = widths + gap * (line.length - 1);
      // Phones: a line of several spans side to side; a lone stamp centres.
      const justified = exact && line.length > 1;
      const spacing = justified ? (room - widths) / (line.length - 1) : gap;
      let x = justified ? side : exact ? (width - lineWidth) / 2 : snapCol((width - lineWidth) / 2, Math.round);
      const tail = tailOf(line);
      for (const index of line) {
        const entry = shown[index];
        entry.item.dataset.shelf = 'top';
        Object.assign(entry.item.style, { left: `${x}px`, top: `${y}px`, width: `${entry.w}px` });
        this.cards[index] = { x, y, w: entry.w, h, tail: entry.work.passwordProtected ? CARD_GUARD.label : 0, shelf: 'top' };
        x = exact ? x + entry.w + spacing : snapCol(x + entry.w + gap, Math.round);
      }
      this.sheetLines.push({ entries: line.map(index => shown[index]), cards: line.map(index => this.cards[index]), y, tall: h + tail });
      y += h + tail + lineGap;
    }
    this.wall.style.width = `${width}px`;
    // The roller's curl lines: where the first line rests at the top, and as
    // far in from the bottom. A sheet that fits on the screen does not roll.
    this.curl = scrolls ? { top, bottom: innerHeight - top, radius: rollerRadius(top, innerHeight) } : null;
    // An endless sheet: one time round is its lines and the gap after the
    // last. Laid out many times over, it starts at the middle copy, its first
    // line resting at the top as ever.
    if (loops) {
      const period = y - start;
      const copies = Math.max(4, Math.min(SHEET_LOOP.copies * 2, Math.floor(SHEET_LOOP.reach / period)));
      const base = Math.floor(copies / 2) * period;
      this.loop = { period, base };
      this.wall.style.height = `${copies * period + innerHeight}px`;
      for (const entry of shown) entry.copy = null;
      if (was) this.scroller.scrollTop = base + phase * period;
    } else {
      this.loop = null;
      this.wall.style.height = scrolls ? `${y - lineGap + top}px` : `${innerHeight}px`;
    }
    // The edges roll where the browser can drive the roller by the scroll,
    // unless motion is reduced; the cards' copies are placed for the scroll.
    const rolls = this.curl && !this.reduced && rollsSmoothly();
    this.roller.setup({ lines: this.sheetLines, roll: rolls ? { ...this.curl, height: innerHeight } : null });
    this.roll();
    requestAnimationFrame(() => this.updateVeils());
    if (quiet) return;
    if (dither) for (const entry of shown) this.ditherCard(entry);
    this.paint();
  }

  // Along the bottom, exploration's filter: a pill that opens a list of its
  // tags to filter by.
  makeFilter() {
    // The filter, exploration's only, along the bottom; its list opens upward.
    this.filterDock = Object.assign(document.createElement('div'), { className: 'works-filter-dock' });
    this.filterDock.innerHTML = '<div class="works-filter">'
      + '<button class="works-filter-button" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="works-filter-list">'
      + '<span class="works-filter-label">all</span><span class="works-filter-caret" aria-hidden="true"></span></button>'
      + '<div class="works-filter-list" id="works-filter-list" role="menu" aria-label="Filter by tag" hidden></div></div>';
    this.nav.after(this.filterDock);
    this.filterButton = this.filterDock.querySelector('.works-filter-button');
    this.filterList = this.filterDock.querySelector('.works-filter-list');
    this.filterButton.addEventListener('click', () => (this.filterOpen ? this.closeFilter() : this.openFilter()));
    const { signal } = this.lifetime;
    document.addEventListener('pointerdown', event => {
      if (this.filterOpen && !this.filterDock.contains(event.target)) this.closeFilter();
    }, { signal });
    this.filterList.addEventListener('keydown', event => {
      const items = [...this.filterList.querySelectorAll('button')];
      const at = items.indexOf(document.activeElement);
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      items[(at + step + items.length) % items.length].focus();
    });
    this.renderFilter();
  }

  // The sheet takes the clock's place: it fades away there and back for the
  // row. As the works view closes from the sheet (`home`), it fades back
  // slowly, in step with the paper turning back.
  syncClock({ away = this.isOpen && this.sheet, home = false } = {}) {
    const clock = document.getElementById('portfolio-clock');
    if (home && !away && clock && !this.reduced && document.body.classList.contains('works-sheet')) {
      clock.style.transition = `opacity ${PAPER_AWAY.duration}ms ease-in-out`;
      setTimeout(() => clock.style.removeProperty('transition'), PAPER_AWAY.duration + 50);
    }
    document.body.classList.toggle('works-sheet', away);
    clock?.toggleAttribute('aria-hidden', away);
    // A label a row card left as it faded out does not outlast the sheet.
    if (away && this.clockLabelled) {
      this.clockLabelled = false;
      this.scene.setMessage('');
    }
  }

  placeTogglePill() {
    const chosen = this.toggles.find(toggle => toggle.dataset.collection === this.collection);
    const group = chosen.parentElement;
    group.style.setProperty('--pill-left', `${chosen.offsetLeft - this.toggles[0].offsetLeft}px`);
    group.style.setProperty('--pill-width', `${chosen.offsetWidth}px`);
  }

  // At the sheet's top and bottom edges, bands that blur the stamps passing
  // under the bar or off the screen and part their colours, as a lens does at
  // its rim, most at the very edge and fading out toward the stamps between
  // (WORKS_VEIL). Each layer is its own element: one wrapping them, faded,
  // would cut them off from what lies behind. Where a filter cannot work on
  // what lies behind (Safari, Firefox), they only blur.
  makeVeils() {
    const chromium = WORKS_VEIL.layers.map(({ split }, level) => aberrationFilter(`works-aberration-${level}`, split)).every(Boolean);
    const veils = [];
    for (const edge of ['top', 'bottom']) {
      WORKS_VEIL.layers.forEach(({ blur, reach }, level) => {
        const veil = Object.assign(document.createElement('div'), { className: 'works-veil' });
        veil.setAttribute('aria-hidden', 'true');
        veil.dataset.edge = edge;
        veil.dataset.level = String(level);
        veil.style.setProperty('--veil-reach', `${reach * 100}%`);
        const filter = `blur(${blur}px)${chromium ? ` url(#works-aberration-${level})` : ''}`;
        veil.style.backdropFilter = filter;
        veil.style.webkitBackdropFilter = `blur(${blur}px)`;
        this.nav.before(veil);
        veils.push(veil);
      });
    }
    return veils;
  }

  // The veils show where the sheet runs on under them: the top one once it
  // has scrolled under the bar, the bottom one while there is more below.
  updateVeils() {
    const at = this.scroller.scrollTop, max = this.scroller.scrollHeight - this.scroller.clientHeight;
    const above = this.sheet && (Boolean(this.loop) || at > 2), below = this.sheet && (Boolean(this.loop) || at < max - 2);
    if (above !== this.scrolled) this.root.classList.toggle('is-scrolled', this.scrolled = above);
    if (below !== this.more) this.root.classList.toggle('has-more', this.more = below);
  }

  // The page's wheel: over the whole window while the row is shown (it lies
  // over the cloth, so the wheel is passed on to it), and on the sheet only
  // over the bar and the filter (constructor), which pass it on to the sheet
  // the browser scrolls itself.
  syncWheel() {
    const whole = this.isOpen && !this.sheet;
    if (whole === this.wheelWhole) return;
    this.wheelWhole = whole;
    if (whole) addEventListener('wheel', this.onWheel, { passive: false });
    else removeEventListener('wheel', this.onWheel);
  }

  // Exploration's tag list: all, then each tag with how many pieces carry it.
  renderFilter() {
    const works = this.collections.exploration;
    const option = (tag, count) => {
      const item = Object.assign(document.createElement('button'), { type: 'button', className: 'works-filter-item' });
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(tag === this.explorationFilter));
      item.innerHTML = '<span class="works-filter-name"></span><span class="works-filter-count"></span>';
      item.firstChild.textContent = tag ?? 'all';
      item.lastChild.textContent = String(count);
      item.addEventListener('click', () => { this.closeFilter({ focus: true }); this.setFilter(tag); });
      return item;
    };
    this.filterList.replaceChildren(option(null, works.length), ...tagCounts(works).map(([tag, count]) => option(tag, count)));
    this.filterButton.querySelector('.works-filter-label').textContent = this.explorationFilter ?? 'all';
    this.filterButton.setAttribute('aria-label', `Filter: ${this.explorationFilter ?? 'all'}`);
  }

  openFilter() {
    if (this.filterOpen) return;
    this.filterOpen = true;
    this.renderFilter();
    this.filterList.hidden = false;
    this.filterButton.setAttribute('aria-expanded', 'true');
    this.filterDock.classList.add('is-filtering');
    if (!this.reduced) this.filterList.animate([{ opacity: 0, transform: 'translateY(4px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    (this.filterList.querySelector('[aria-checked="true"]') ?? this.filterList.firstChild).focus({ preventScroll: true });
  }

  closeFilter({ focus = false } = {}) {
    if (!this.filterOpen) return;
    this.filterOpen = false;
    this.filterList.hidden = true;
    this.filterButton.setAttribute('aria-expanded', 'false');
    this.filterDock.classList.remove('is-filtering');
    if (focus) this.filterButton.focus({ preventScroll: true });
  }

  setFilter(tag) {
    if (tag === this.filter || this.busy) return;
    this.relayout(() => {
      this.filter = tag;
      this.renderFilter();
    });
  }

  // Lays the cards out again after `change`: cards that go fade out, those
  // that stay glide from where they were to their new places, and new ones
  // fade in, all from the start of the row or the top of the sheet.
  async relayout(change) {
    this.busy = true;
    this.activate(null);
    this.gliding = false;
    const before = new Map(this.shown.map(entry => [entry, entry.item.getBoundingClientRect()]));
    const was = this.filter;
    // The rolled edges fade as the cards that go fade, and come back once the
    // cards have settled.
    if (!this.reduced) this.roller.hold();
    this.root.style.removeProperty('--roller-enter');
    change();
    const keep = entry => !this.filter || entry.work.tags.includes(this.filter);
    if (!this.reduced && this.filter !== was) {
      const going = this.items.filter(entry => before.has(entry) && !keep(entry));
      await Promise.all(going.map(entry => entry.item.animate([{ opacity: 1 }, { opacity: 0 }], { duration: EXPLORATION_VIEW.leave, easing: 'ease', fill: 'forwards' }).finished.catch(() => {})));
      for (const entry of going) entry.item.getAnimations().forEach(animation => animation.cancel());
    }
    // The cards keep their dithers, stretched a moment, while they move.
    // They move flat; the roller comes in once they have settled. With no
    // cards leaving, its fade out has not begun: it is out at once, so the
    // new strips never flash.
    if (!this.reduced) this.roller.layer.getAnimations().forEach(animation => animation.finish());
    this.layout({ dither: false });
    this.toStart();
    this.updateRow();
    this.updateVeils();
    this.roll();
    let longest = EXPLORATION_VIEW.move;
    if (!this.reduced) {
      const { move, leave, enter, stagger } = EXPLORATION_VIEW;
      const ease = 'cubic-bezier(.22, 1, .36, 1)', screen = { width: innerWidth, height: innerHeight };
      // Every frame has the same functions, so only the offset and size
      // ease; scaled about the card's middle, written about its top left.
      const at = (dx, dy, sx, sy, [mx, my]) => `translate(${dx}px, ${dy}px) translate(${mx}px, ${my}px) scale(${sx}, ${sy}) translate(${-mx}px, ${-my}px)`;
      const middle = rect => [rect.left + rect.width / 2, rect.top + rect.height / 2];
      let settling = 0;
      this.shown.forEach((entry, index) => {
        const from = before.get(entry), to = entry.item.getBoundingClientRect();
        const kind = cardMove(from, to, screen);
        if (kind === 'none') return;
        const origin = '0 0';
        const card = this.cards[index], centre = [card.w / 2, card.h / 2];
        const [tx, ty] = middle(to);
        const held = from && (([fx, fy]) => at(fx - tx, fy - ty, from.width / to.width, from.height / to.height, centre))(middle(from));
        const rest = at(0, 0, 1, 1, centre), lowered = at(0, 10, 1, 1, centre);
        if (kind === 'glide') {
          entry.item.animate([
            { transformOrigin: origin, transform: held },
            { transformOrigin: origin, transform: rest },
          ], { duration: move, easing: ease });
          return;
        }
        // Out where it was, then in where it is, in one timeline so neither
        // half overrides the other. A card that was out of sight only comes in.
        const delay = (from && from.width ? leave : 0) + settling++ * stagger, total = delay + enter;
        const frames = [];
        if (from && from.width && cardMove(from, from, screen) !== 'none') {
          frames.push({ offset: 0, opacity: 1, transformOrigin: origin, transform: held, easing: 'ease' },
            { offset: leave / total, opacity: 0, transformOrigin: origin, transform: held });
        } else frames.push({ offset: 0, opacity: 0, transformOrigin: origin, transform: lowered });
        frames.push({ offset: delay / total, opacity: 0, transformOrigin: origin, transform: lowered, easing: ease },
          { offset: 1, opacity: 1, transformOrigin: origin, transform: rest });
        entry.item.animate(frames, { duration: total });
        longest = Math.max(longest, total);
      });
    }
    this.keepPainting(longest + 100);
    this.busy = false;
    // Then, one card at a time in quiet moments, each is dithered at its new
    // size (or shown at once from one it had before), those in view first.
    const layout = this.shown;
    const settled = ++this.relayouts;
    await new Promise(resolve => setTimeout(resolve, this.reduced ? 0 : longest));
    // Settled, the cards at the edges roll, the roller fading in.
    if (settled === this.relayouts) this.roller.release();
    const idle = () => new Promise(resolve => (window.requestIdleCallback ?? setTimeout)(resolve));
    const inView = entry => { const r = entry.item.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; };
    for (const entry of [...layout.filter(inView), ...layout.filter(entry => !inView(entry))]) {
      if (this.shown !== layout) return;
      this.ditherCard(entry);
      await idle();
    }
  }

  // Readies the row while the paper is read: laid out once out of sight for
  // its cards' size, then each card's photo decoded and dithered at that
  // size in a quiet moment of its own, so the paper's first turn has nothing
  // left to draw. Opened first, the row dithers what is left as ever.
  async warm() {
    if (this.isOpen) return;
    this.sealsAway(true);
    this.root.style.visibility = 'hidden';
    this.root.hidden = false;
    this.layout({ quiet: true });
    const { clientWidth: width, clientHeight: height } = this.items[0].image;
    this.root.hidden = true;
    this.root.style.removeProperty('visibility');
    const idle = () => new Promise(resolve => (window.requestIdleCallback ?? setTimeout)(resolve));
    // A pass changes which photo protected cards show.
    await this.passChecked;
    for (const entry of this.items) {
      await entry.photo.decode().catch(() => {});
      await idle();
      if (this.isOpen) return;
      this.ditherCard(entry, { width, height });
    }
  }

  // The cards' details seals follow the pointer over the whole page, each
  // measuring its place as it moves. While the row is out of sight they are
  // put away: they rest as at first and measure nothing, and wake as it opens.
  // Shown, every one stays awake, so its light eases in as ever.
  sealsAway(away) {
    for (const entry of Object.values(this.built).flat()) entry.seal?.wax.setSuspended(away);
  }

  // Whether this visitor holds the PIN's pass (server/works-pass.mjs). With
  // it, protected cards load their full cover, private until then, and
  // dither it finely as it arrives.
  async checkPass() {
    let passed = false;
    try { passed = (await (await fetch('/api/pass', { credentials: 'same-origin' })).json()).passed === true; } catch { /* stays locked */ }
    if (passed === this.passed) return;
    this.passed = passed;
    for (const entry of Object.values(this.built).flat()) {
      if (!entry.work.passwordProtected) continue;
      entry.photo.src = passed ? fullCover(entry.work) : entry.work.image;
    }
  }

  // The dots a card's photo is dithered with: coarser for protected work,
  // until the visitor has the PIN.
  ditherOf(entry) {
    if (ownShape(entry.work)) return DITHER_NONE;
    return entry.work.passwordProtected && !this.passed ? DITHER_LOCKED : undefined;
  }

  // Dithers a card's photo at the size its window shows it, again only when
  // that size or its dots change. Without WebGL, the photograph shows instead.
  // `size`, the card's photo in CSS pixels, when the row is out of sight.
  ditherCard(entry, size = null) {
    const { image, photo } = entry;
    // Exploration's pieces show their photo as it is, undithered.
    if (ownShape(entry.work)) {
      if (!photo.complete || !photo.naturalWidth) return;
      const src = photo.currentSrc || photo.src;
      if (image.src !== src) image.src = src;
      entry.dithered = 'plain';
      entry.shown = Promise.resolve();
      return;
    }
    const { width, height } = size ?? { width: image.clientWidth, height: image.clientHeight };
    if (!photo.complete || !photo.naturalWidth || !width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const options = this.ditherOf(entry);
    const key = `${width}x${height}@${dpr}${options ? ':locked' : ''}:${photo.currentSrc}`;
    if (entry.dithered === key) return;
    entry.dithered = key;
    // A size this card has had before shows its dither again at once.
    entry.dithers ??= new Map();
    if (entry.dithers.has(key)) {
      image.src = entry.dithers.get(key);
      entry.shown = Promise.resolve();
      if (this.glitched === entry) this.glitched = null;
      return;
    }
    // `shown` settles once the card shows this dither, for a flight home to
    // carry it (project-transition.mjs). The dither is drawn off the main
    // thread where it can be (dither.mjs).
    entry.shown = ditherPhotoBlob(photo, width, height, dpr, options).then(blob => {
      if (entry.dithered !== key) return;
      if (!blob) { image.src = photo.src; return; }
      image.src = URL.createObjectURL(blob);
      // Decoded now, so a card first shown has only to be drawn.
      image.decode().catch(() => {});
      // Kept for a return to this size (the row and the sheet), the oldest
      // of more than a few let go.
      entry.dithers.set(key, image.src);
      if (entry.dithers.size > 4) {
        const [oldest, url] = entry.dithers.entries().next().value;
        entry.dithers.delete(oldest);
        if (url !== image.src) URL.revokeObjectURL(url);
      }
    });
    if (this.glitched === entry) this.glitched = null;
  }

  // A card glitches around the pointer as it moves: one shared canvas
  // (dither.mjs), moved into whichever card is hovered, redraws its photo with
  // some tiles near the pointer out of place, and hides once the pointer has
  // been still a moment. Not at all for reduced motion.
  glitch(entry, event) {
    if (this.reduced || event.pointerType === 'touch' || !(entry.image.src.startsWith('blob:') || entry.dithered === 'plain')) return;
    this.glitcher ??= createGlitch() ?? false;
    if (!this.glitcher) return;
    const { canvas } = this.glitcher;
    const { image } = entry;
    if (this.glitched !== entry) {
      this.glitched = entry;
      canvas.className = 'works-glitch';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.translate = image.style.translate;
      entry.picture.append(canvas);
      // The photo decoded ahead (readyGlitch), if it is still the one shown.
      const ready = this.glitchReady?.get(entry);
      this.glitchReady?.delete(entry);
      const pixels = ready?.src === (entry.photo.currentSrc || entry.photo.src) ? ready.pixels : entry.photo;
      this.glitcher.show(entry.photo, image.clientWidth, image.clientHeight, Math.min(devicePixelRatio || 1, 2), this.ditherOf(entry), pixels);
      ready?.pixels.close();
    }
    clearTimeout(this.glitchSettle);
    this.glitchSettle = setTimeout(() => this.unglitch(entry), GLITCH.settle);
    const now = performance.now();
    if (now - (this.glitchedAt ?? -Infinity) < GLITCH.interval) return;
    this.glitchedAt = now;
    // The pointer and the window the tiles divide, in the photo's own pixels,
    // through any tilt.
    const photo = image.getBoundingClientRect(), view = entry.picture.getBoundingClientRect();
    if (!photo.width || !photo.height) return;
    const scale = image.offsetWidth / photo.width;
    this.glitcher.draw(
      { x: (view.left - photo.left) * scale, y: (view.top - photo.top) * scale, width: view.width * scale, height: view.height * scale },
      { x: (event.clientX - photo.left) * scale, y: (event.clientY - photo.top) * scale },
      Math.random() * 1000,
    );
    canvas.classList.add('is-glitching');
  }

  // Set while a project is on its way or open over the row, until its card
  // has flown home (project-transition.mjs). Meanwhile the photos readied for
  // the glitch are let go, so none is decoded during the flight or held
  // through the project's page; back on the row, once the card has landed,
  // they are readied again.
  get departing() { return this.leaving; }
  set departing(leaving) {
    this.leaving = leaving;
    if (leaving) this.dropGlitch();
    else this.readyGlitch(700);
  }

  // Readies the glitch for the works row once its cards have settled in
  // (`after` ms) and the page is quiet: its WebGL is made now rather than on
  // the first hover, and each card's photo is decoded off the main thread, so
  // its first hover only copies the pixels up instead of decoding the photo
  // again there. Each decoded photo is kept only until it is uploaded, or
  // until a project is chosen, or the row closes or turns to exploration,
  // whose pieces glitch as they always have.
  async readyGlitch(after = 0) {
    this.dropGlitch();
    if (this.laidOut !== 'works' || this.reduced || !hovering?.matches || !decodesAlike()) return;
    const ready = this.glitchReady = new Map();
    const current = () => this.glitchReady === ready && this.isOpen;
    await new Promise(resolve => setTimeout(resolve, after));
    await new Promise(resolve => (window.requestIdleCallback ?? setTimeout)(resolve));
    if (!current()) return;
    this.glitcher ??= createGlitch() ?? false;
    if (!this.glitcher) return;
    for (const entry of this.built.works) {
      const { photo } = entry, src = photo.currentSrc || photo.src;
      if (!photo.complete || !photo.naturalWidth || this.glitcher.holds(photo) || entry.ownShape) continue;
      const pixels = await bitmapOf(photo);
      if (pixels === photo) continue;
      if (!current()) { pixels.close(); return; }
      // Hovered while it was decoding, it has its texture already.
      if (this.glitcher.holds(photo)) { pixels.close(); continue; }
      ready.set(entry, { src, pixels });
    }
  }

  dropGlitch() {
    for (const { pixels } of this.glitchReady?.values() ?? []) pixels.close();
    this.glitchReady = null;
  }

  unglitch(entry) {
    if (this.glitched !== entry) return;
    clearTimeout(this.glitchSettle);
    this.glitcher.canvas.classList.remove('is-glitching');
  }

  // Each photo's sideways parallax follows the scroll position, worked out
  // from the cards' known places without measuring the page.
  updateRow() {
    if (!this.cards) return;
    // On the sheet the photos hold still, and there are no dots to keep.
    if (this.sheet) {
      for (const entry of this.shown) entry.image.style.translate = '';
      return;
    }
    // The scroll is read before the photos are slid: read after, it would have
    // the browser restyle the row first, every frame. Sliding a photo inside
    // its window, which clips it, changes neither.
    const at = this.scroller.scrollLeft, max = this.scroller.scrollWidth - this.scroller.clientWidth;
    const centre = at + innerWidth / 2;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.cards.forEach((card, index) => {
      const entry = this.shown[index];
      entry.parallax = this.reduced || entry.ownShape ? 0 : -clamp((card.x + card.w / 2 - centre) / innerWidth, -1, 1) * card.w * PHOTO_PARALLAX;
      // Whole device pixels keep the dither dots sharp as the photo slides.
      entry.image.style.translate = `${Math.round(entry.parallax * dpr) / dpr}px 0`;
      if (this.glitched === entry) this.glitcher.canvas.style.translate = entry.image.style.translate;
    });
    // The current stamp is the one nearest the middle, except at either end
    // of the row, where it is the first or the last.
    let current = 0;
    if (max > 0 && at >= max - 1) current = this.cards.length - 1;
    else if (at > 1) {
      const distance = card => Math.abs(card.x + card.w / 2 - centre);
      this.cards.forEach((card, index) => { if (distance(card) < distance(this.cards[current])) current = index; });
    }
    if (current !== this.current) {
      this.current = current;
      [...this.dots.children].forEach((dot, index) => index === current ? dot.setAttribute('aria-current', 'true') : dot.removeAttribute('aria-current'));
    }
  }

  renderDots() {
    this.dotsFor = this.shown;
    this.current = null;
    this.dots.replaceChildren(...this.shown.map((entry, index) => {
      const dot = Object.assign(document.createElement('button'), { type: 'button', className: 'works-dot' });
      dot.setAttribute('aria-label', entry.work.title);
      dot.addEventListener('click', () => this.goTo(index));
      return dot;
    }));
  }

  // One frame loop moves everything together: the wheel glide, the row's
  // state and the frames' paper motion, so the photos
  // never trail the stamps they sit in.
  paint() {
    if (this.painting) return;
    this.painting = requestAnimationFrame(this.frameStep ??= now => this.frame(now));
  }

  frame(now) {
    this.painting = null;
    if (!this.cards) { this.painted = null; return; }
    const elapsed = Math.min(64, now - (this.painted ?? now));
    this.painted = now;
    if (this.gliding) {
      this.glidePosition += (this.glideTarget - this.glidePosition) * (1 - Math.exp(-elapsed / WHEEL_GLIDE));
      if (Math.abs(this.glideTarget - this.glidePosition) < .5) {
        this.glidePosition = this.glideTarget;
        this.gliding = false;
      }
      this.scroller[this.scrollAxis] = this.glidePosition;
    }
    this.roll();
    let moving = this.gliding || now < (this.paintUntil ?? 0);
    // Only a card hovered, pressed or still settling moves; the rest lie flat
    // and are not measured. Read those cards' places before writing anything
    // this frame, the photos' slide included (a card's place is its own, not
    // its photo's), so nothing has to be restyled to answer. Native images
    // travel with their paper frame without a separate rendering layer.
    const resting = entry => entry !== this.active && !entry.pressed && !entry.pose.rx && !entry.pose.ry && entry.pose.scale === 1;
    const live = this.items.filter(entry => !resting(entry));
    const places = new Map(live.map(entry => [entry, entry.item.getBoundingClientRect()]));
    this.updateRow();
    live.forEach(entry => {
      const anchor = places.get(entry);
      const hovered = entry === this.active;
      // The frame answers the pointer as the homepage paper does: it tilts
      // toward it, lifts a little, and presses flat when clicked.
      const target = paperTarget({
        x: (entry.pointer.x - anchor.left) / anchor.width * 2 - 1,
        y: (entry.pointer.y - anchor.top) / anchor.height * 2 - 1,
        hovered, pressed: entry.pressed, reduced: this.reduced, pressScale: CARD_PRESS.scale,
      });
      entry.pose = this.reduced ? target : advancePaper(entry.pose, target, elapsed);
      const { rx, ry, scale } = entry.pose;
      entry.frame.style.transform = rx || ry || scale !== 1 ? `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})` : '';
      moving ||= entry.pose.rx !== target.rx || entry.pose.ry !== target.ry || entry.pose.scale !== target.scale;
    });
    if (moving) this.paint();
    else this.painted = null;
  }

  // Back to the start: the row's left end, or the sheet's first line under
  // the bar (on an endless sheet, in its middle copy).
  toStart() {
    this.gliding = false;
    this.scroller.scrollLeft = 0;
    this.scroller.scrollTop = this.loop?.base ?? 0;
  }

  // An endless sheet, at rest, brought back to the same place in its middle
  // copy, so it never runs out of copies either way. Nothing on the screen
  // changes.
  recentre() {
    const loop = this.loop;
    if (!loop || !this.sheet || this.touching || this.gliding) return;
    const at = this.scroller.scrollTop;
    const to = loop.base + ((((at - loop.base) % loop.period) + loop.period) % loop.period);
    if (Math.abs(to - at) < loop.period / 2) return;
    this.scroller.scrollTop = to;
    this.paint();
  }

  // Places the sheet's cards for its scroll, from the sheet's own sums,
  // without measuring: on an endless sheet, each card in whichever copy shows
  // most of it between the curl lines, and a ghost of it at each other copy
  // there; and runs the roller's strips for the lines near it. The strips
  // follow the scroll on their own (sheet-roller.mjs); nothing here changes
  // from frame to frame but a copy coming round.
  roll() {
    const loop = this.sheet && this.cards ? this.loop : null;
    if (!this.sheet || !this.cards || !(loop || this.curl)) return;
    // A sheet that does not run on round, whose strips either all run or do
    // not run at all, has nothing that changes with the scroll: no copy comes
    // round and no ghost shows. Once placed for its layout (its cards), it is
    // left as it is.
    const still = !loop && (!this.roller.rolling || this.roller.rolling.always);
    if (still && this.rolled === this.cards) return;
    const scroll = this.scroller.scrollTop, height = innerHeight;
    // Between the curl lines while the edges roll; else the whole screen.
    const edges = this.roller.rolling ? this.curl : { top: 0, bottom: height };
    this.shown.forEach((entry, index) => {
      const card = this.cards[index];
      if (!card) return;
      const tall = card.h + card.tail;
      // Copies there, and a card's height beyond, so a ghost is in place
      // before it comes into view.
      const copies = copiesOf(card.y, tall, { scroll, period: loop?.period ?? 0, from: edges.top - tall, to: edges.bottom + tall });
      // The card's own copy: the one most between the curl lines, or else
      // the nearest the middle.
      const flatness = ([, y]) => Math.min(y + tall, edges.bottom) - Math.max(y, edges.top);
      const nearness = ([, y]) => -Math.abs(y + tall / 2 - height / 2);
      let kept = copies[0];
      for (const copy of copies) if (flatness(copy) > flatness(kept) || (flatness(copy) === flatness(kept) && nearness(copy) > nearness(kept))) kept = copy;
      if (loop) {
        const copy = kept?.[0] ?? Math.round((scroll + height / 2 - card.y - tall / 2) / loop.period);
        if (entry.copy !== copy) {
          entry.copy = copy;
          entry.item.style.top = `${card.y + copy * loop.period}px`;
        }
      }
      this.roller.ghost(entry, card, loop ? copies.filter(copy => copy !== kept).map(([copy]) => card.y + copy * loop.period) : []);
    });
    this.roller.place(scroll, loop?.period ?? 0);
    this.rolled = still ? this.cards : null;
  }

  keepPainting(duration) {
    this.paintUntil = performance.now() + duration;
    this.paint();
  }

  // Eases the row toward its target, so wheel steps glide rather than jump.
  glideBy(delta) {
    const axis = this.scrollAxis;
    this.glideTarget = clamp((this.gliding ? this.glideTarget : this.scroller[axis]) + delta, 0, this.scrollMax);
    if (this.reduced) { this.scroller[axis] = this.glideTarget; this.paint(); return; }
    if (!this.gliding) this.glidePosition = this.scroller[axis];
    this.gliding = true;
    this.paint();
  }

  goTo(index) {
    if (!this.cards?.length) return;
    const place = clamp(index, 0, this.cards.length - 1), card = this.cards[place];
    const at = this.gliding ? this.glideTarget : this.scroller[this.scrollAxis];
    if (this.sheet) this.glideBy(this.sheetY(place, at) + card.h / 2 - this.scroller.clientHeight / 2 - at);
    else this.glideBy(card.x + card.w / 2 - innerWidth / 2 - at);
  }

  activate(entry) {
    if (this.active === entry) return;
    this.active = entry;
    this.root.classList.toggle('has-active', Boolean(entry));
    for (const item of this.items) item.item.classList.toggle('is-active', item === entry);
    this.paint();
    // The sheet hides the clock: it is not set going, and the cloth under it
    // is not redrawn, for every card that passes under the pointer; a label
    // left from the row is cleared.
    if (this.sheet) {
      if (!entry && this.clockLabelled) this.scene.setMessage('');
      this.clockLabelled = false;
      return;
    }
    this.clockLabelled = Boolean(entry);
    if (entry) this.scene.setMessage(this.clockMessage(entry.work));
    else this.scene.setMessage('');
  }

  // The clock keeps one line, so it never rises into the cards above it.
  clockMessage(work) {
    const full = clockLabel(work);
    const fits = clockTextLayout(full, { width: innerWidth, height: innerHeight, view: this.scene.view }).lines.length === 1;
    return fits ? full : clockLabel(work, true);
  }

  // Every card shown again, at once, for a project moved to on its page
  // whose card the filter hides, so "back" has a card to fly home to.
  showAll() {
    if (!this.filter) return;
    this.filter = null;
    this.renderFilter();
    this.layout();
  }

  choose(entry, event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
    event.preventDefault();
    if (this.departing) return;
    // Touch has no hover, so a tap opens the work at once, without the seal.
    if (workHref(entry.work)) transitionToProject(this, entry, { seal: event.pointerType !== 'touch' });
    else if (entry.ownShape) this.openPiece(entry);
    else this.activate(entry);
  }

  // A piece without a page (exploration) grows out of its card, whole, over
  // the row; the arrows step through the rest of its collection, and the row
  // follows, so "back" returns the piece shown to its own card. One close-up
  // per collection, made when first wanted.
  openPiece(entry) {
    const items = this.shown;
    this.closeups ??= {};
    // Closed, focus comes back to the card of the piece last shown.
    let showing = items.indexOf(entry);
    const closeup = this.closeups[`${this.collection}:${this.filter ?? ''}`] ??= mountCloseup({
      images: items.map(({ work }) => ({ src: work.image, preview: work.preview, width: work.width, height: work.height, alt: work.alt })),
      motionPreference: this.motionPreference,
      sourceOf: index => items[index].frame,
      onIndex: index => { showing = index; this.jumpTo(index); },
      onClose: () => items[showing]?.link.focus({ preventScroll: true, focusVisible: false }),
    });
    showing = items.indexOf(entry);
    this.activate(null);
    closeup.open(showing);
  }

  // How far down the sheet a card lies: on an endless sheet, in the copy
  // nearest the scroll `at`.
  sheetY(index, at = this.scroller.scrollTop) {
    const card = this.cards[index], loop = this.loop;
    if (!loop) return card.y;
    const middle = at + this.scroller.clientHeight / 2 - card.h / 2;
    return card.y + Math.round((middle - card.y) / loop.period) * loop.period;
  }

  // Straight to a card, unseen, under the close-up.
  jumpTo(index) {
    const card = this.cards?.[index];
    if (!card) return;
    this.gliding = false;
    if (this.sheet) {
      this.scroller.scrollTop = clamp(this.sheetY(index) + card.h / 2 - this.scroller.clientHeight / 2, 0, this.scrollMax);
      this.roll();
    }
    else this.scroller.scrollLeft = clamp(card.x + card.w / 2 - innerWidth / 2, 0, this.scrollMax);
    this.paint();
  }
}

// Printed on the picture: the title in the stamp's top left, the years in its
// top right as the stamp's value, and the tags as pills in its bottom right.
function cardText(work) {
  const box = document.createElement('span');
  box.className = 'works-text';
  box.setAttribute('aria-hidden', 'true');
  const part = (className, textContent) => Object.assign(document.createElement('span'), { className, textContent });
  const tags = part('works-meta', '');
  tags.append(...work.tags.map(tag => part('works-tag', tag)));
  box.append(part('works-title', work.title), part('works-value', yearLabel(work)), tags);
  return box;
}

