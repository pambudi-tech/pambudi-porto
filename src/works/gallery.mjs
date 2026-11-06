import { GRID } from '../stitch/model.mjs';
import { paperFlipKeyframes } from '../paper/paper-flip.mjs';
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

// The paper turns away using the first half of its own flip and is gone
// when edge-on; it returns through the second half, from the other side.
export const PAPER_AWAY = Object.freeze({ duration: 560 });
export const WORKS_MOTION = Object.freeze({ fade: 280 });
// Wheel scrolling glides toward where the wheel has sent it.
export const WHEEL_GLIDE = 140;
// How far a pressed card gives, and the least time a press shows.
export const CARD_PRESS = Object.freeze({ scale: .97, hold: 120 });
// The two views of either collection: the `row`, sideways, and the `sheet`,
// the same stamps wrapped into lines that scroll down. On the sheet a line holds about
// `columns` 4:3 stamps for the screen's width. Changing view or filter, cards
// that go fade out over `leave` ms first. A card with only a short way to its
// new place glides there over `move` ms; one going further than `far` of the
// screen's diagonal, or coming from off screen, fades out where it was and
// settles in at its new place over `enter` ms, `stagger` ms after the last.
export const EXPLORATION_VIEW = Object.freeze({
  initial: 'row', move: 560, leave: 180, enter: 380, stagger: 28, far: .28,
  // On the sheet, as many columns as `most`, down to `fewest`, as keep each
  // stamp at least `narrowest` px wide, so it stays clear to see; phones
  // always show `phone`.
  columns: { most: 4, fewest: 2, narrowest: 280, phone: 2 },
});

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

// On phones the sheet's stamps keep this far, in px, from the screen's sides.
export const SHEET_PHONE_SIDE = 16;

// The veils at the sheet's top and bottom edges: each layer blurs by `blur`
// px, parts red and blue `split` px either way (Chromium), and fades out by
// `reach` of the band's depth, measured from the edge.
export const WORKS_VEIL = Object.freeze({
  layers: [{ blur: 5, split: 3, reach: 1 }],
});
// The sheet rolls away at its top and bottom edges, as if wrapped over a
// cylinder there: past where the first line's middle rests, a stamp follows
// the curve, tilting back further the further it goes, sliding along the arc
// and sinking away, seen from `perspective` px. The cylinder's radius makes
// a stamp at the screen's edge `roll` radians round (about 70°); it is
// edge-on just beyond.
export const SHEET_TAPER = Object.freeze({ roll: 1.2, perspective: 1000 });

// Where a stamp `past` px beyond the curl's start lies on a cylinder of
// `radius`: its tilt (radians, up to a quarter turn), how far it slides back
// toward the curl's start along the screen, and how far it sinks away.
export function rollAt(past, radius) {
  const angle = Math.min(Math.PI / 2 - .001, past / radius);
  return { angle, slide: past - radius * Math.sin(angle), sink: radius * (1 - Math.cos(angle)) };
}

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

export function halfFlipKeyframes(half) {
  const frames = half === 'away' ? paperFlipKeyframes(0, 180) : paperFlipKeyframes(-180, 0);
  return frames
    .filter(frame => half === 'away' ? frame.offset <= .5 : frame.offset >= .5)
    .map(frame => ({ ...frame, offset: half === 'away' ? frame.offset * 2 : frame.offset * 2 - 1 }));
}

export class WorksGallery {
  constructor(root, { scene, paper, frontSeal, motionPreference, collections = { works: WORKS, exploration: EXPLORATION } }) {
    this.root = root;
    this.scene = scene;
    this.paper = paper;
    this.turn = paper.querySelector('.paper-turn');
    this.frontSeal = frontSeal;
    this.motionPreference = motionPreference;
    this.scroller = root.querySelector('.works-scroll');
    this.wall = root.querySelector('.works-wall');
    this.isOpen = false;
    this.busy = false;
    this.lifetime = new AbortController();
    const { signal } = this.lifetime;
    this.active = null;
    this.collections = collections;
    this.collection = 'works';
    // The view, shared by both collections, and the tag exploration is
    // filtered to, kept for the visit. Selected works has no filter.
    this.view = EXPLORATION_VIEW.initial;
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
    this.tools = this.makeTools();
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
      this.placeViews();
      this.markView();
      this.layout();
    }, { signal });
    // The row scrolls sideways, freely. It lies over the cloth without taking
    // its pointer, so the wheel is passed on and the cloth stays stitchable.
    addEventListener('wheel', event => {
      if (!this.isOpen || this.closeupOpen || this.filterOpen) return;
      event.preventDefault();
      const delta = this.sheet ? event.deltaY || event.deltaX : Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      this.glideBy(event.deltaMode === 1 ? delta * 40 : delta);
    }, { passive: false, signal });
    // A native scroll (a swipe, or the keyboard) is drawn in the same frame loop.
    this.scroller.addEventListener('scroll', () => {
      this.paint();
      this.updateVeils();
    }, { passive: true });
  }

  get reduced() { return this.motionPreference.matches; }
  // On the sheet, which scrolls down rather than sideways.
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
    image.addEventListener('load', () => this.paint());
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
      this.goTo(index);
      this.activate(entry);
    });
    link.addEventListener('blur', () => { if (this.active === entry) this.activate(null); });
    link.addEventListener('click', event => this.choose(entry, event));
    return entry;
  }

  // `instant` opens it already laid out, the paper away and the cards in place.
  async open({ history = true, instant = false } = {}) {
    if (this.isOpen || this.busy) return;
    this.busy = true;
    if (history && location.hash !== '#works') window.history.pushState({ works: true }, '', '#works');
    this.scene.setPaperPresent(false);
    this.scene.setBirdAway?.(true, { immediate: instant });
    this.paper.inert = true;
    this.paper.dispatchEvent(new CustomEvent('paperflipstart'));
    if (!instant) await this.turnPaper('away');
    this.paper.style.visibility = 'hidden';
    this.isOpen = true;
    this.root.hidden = false;
    document.body.classList.add('works-open');
    this.syncClock();
    this.placeViews();
    this.markView();
    this.placeTogglePill();
    this.placeTogglePill();
    this.layout();
    this.scroller.scrollLeft = this.scroller.scrollTop = 0;
    this.paint();
    // Lay the cards out, then let them settle onto the cloth in turn.
    if (instant) {
      this.root.classList.add('is-instant', 'is-open');
      requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('is-instant')));
    } else requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.keepPainting(this.shown.length * 80 + 700);
    this.busy = false;
    (this.shown.find(entry => workHref(entry.work)) ?? this.shown[0])?.link.focus({ preventScroll: true, focusVisible: false });
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
    // The clock comes back as the cards leave.
    this.syncClock({ away: false });
    if (history && location.hash === '#works') {
      if (window.history.state?.works) window.history.back();
      else window.history.replaceState(null, '', location.pathname + location.search);
    }
    this.root.classList.remove('is-open');
    this.keepPainting(WORKS_MOTION.fade + 100);
    await new Promise(resolve => setTimeout(resolve, this.reduced ? 0 : WORKS_MOTION.fade));
    this.root.hidden = true;
    this.isOpen = false;
    this.paper.style.visibility = '';
    this.scene.restPaper?.();
    this.scene.relightPaper?.();
    this.scene.setBirdAway?.(false);
    await this.turnPaper('back');
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
    this.keepPainting(WORKS_MOTION.fade + 100);
    await new Promise(resolve => setTimeout(resolve, this.reduced ? 0 : WORKS_MOTION.fade));
    for (const entry of this.items) entry.item.remove();
    this.items = this.built[collection] ??= this.collections[collection].map((work, index) => this.createItem(work, index));
    for (const entry of this.items) this.wall.append(entry.item);
    this.gliding = false;
    this.root.classList.toggle('is-sheet', this.sheet);
    this.layout();
    this.scroller.scrollLeft = this.scroller.scrollTop = 0;
    // Let the new cards be drawn hidden once, so they arrive in turn.
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('is-swapping')));
    this.keepPainting(this.shown.length * 80 + 700);
    this.busy = false;
  }

  // Half of the paper's own turn: it accelerates into edge-on and vanishes,
  // then returns decelerating from edge-on, completing the revolution.
  async turnPaper(half) {
    if (this.reduced) return;
    const animation = this.turn.animate(halfFlipKeyframes(half), {
      duration: PAPER_AWAY.duration, easing: 'linear', fill: half === 'away' ? 'forwards' : 'none', composite: 'add',
    });
    this.turnAnimation?.cancel();
    this.turnAnimation = half === 'away' ? animation : null;
    await animation.finished;
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

    // The details seals match the homepage's seal, size and lettering.
    const label = this.frontSeal.querySelector('.works-seal-label');
    this.root.style.setProperty('--seal-width', `${this.frontSeal.offsetWidth}px`);
    this.root.style.setProperty('--seal-label-size', getComputedStyle(label).fontSize);

    const clockTop = view.y + (Math.floor((height - view.y) / pitch) - (stacked ? 21 : 7)) * pitch;
    // Only the cards the filter keeps are laid out; the rest are hidden.
    const shown = this.filter ? this.items.filter(entry => entry.work.tags.includes(this.filter)) : this.items;
    for (const entry of this.items) entry.item.hidden = !shown.includes(entry);
    this.shown = shown;
    // The dots sit three rows above the clock, and the stamps stop three rows
    // above the dots, so the space above the dots matches the space below.
    if (this.dotsFor !== shown) this.renderDots();
    this.dots.style.top = `${clockTop - 3 * pitch}px`;

    // Cards lean to the top or the bottom of the space between the top bar
    // and the clock, each at its own height there; all share one size.
    // Exploration's filter, under the bar, extends it; so does the view
    // switch, which sits there on phones.
    const under = this.collection === 'exploration' || this.stacked;
    const barBottom = Math.max(this.nav.getBoundingClientRect().bottom, under ? this.tools.getBoundingClientRect().bottom : 0);
    const top = snapRow(barBottom + (stacked ? 16 : 24));
    if (this.sheet) {
      this.layoutSheet({ top, bar: barBottom, pitch, stacked, snapCol, quiet, dither });
      return;
    }
    this.scroller.style.removeProperty('top');
    this.scroller.style.removeProperty('bottom');
    const bottom = snapRow(clockTop - 6 * pitch, Math.floor);
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
  layoutSheet({ top, bar, pitch, stacked, snapCol, quiet, dither }) {
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
    // sides, sized to fit rather than to whole perforations, and each line of
    // two is justified to those edges. Wider screens keep to the holes.
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
    // A sheet that would scroll starts just under the bar and keeps as much
    // room after its last line as before its first. One with too few stamps
    // to scroll sits centred in the room under the bar, never nearer it than
    // a scrolling one starts, and does not roll (taper): nothing runs on past
    // its edges. Whole stitches on wider screens.
    const block = lines.reduce((sum, line) => sum + h + tailOf(line), 0) + lineGap * (lines.length - 1);
    const scrolls = top + block + top > innerHeight;
    const middle = bar + (innerHeight - bar - block) / 2;
    const start = scrolls ? top : Math.max(top, exact ? middle : bar + Math.round((middle - bar) / pitch) * pitch);
    let y = start;
    this.cards = new Array(shown.length);
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
      y += h + tail + lineGap;
    }
    this.wall.style.width = `${width}px`;
    // As much room after the last line as before the first, so at the end
    // of the scroll the last line rests where the bottom curl begins, flat,
    // as the first line does at the top. A sheet that fits stays the screen's
    // height, and flat.
    this.wall.style.height = scrolls ? `${y - lineGap + top}px` : `${innerHeight}px`;
    // Stamps taper once they pass where the first line's middle rests.
    this.taperZone = scrolls ? top + h / 2 : 0;
    requestAnimationFrame(() => this.updateVeils());
    if (quiet) return;
    if (dither) for (const entry of shown) this.ditherCard(entry);
    this.paint();
  }

  // Beside the collection toggle, a switch between the row and the sheet,
  // its ink pill sliding to the view chosen; under the bar, a pill that opens
  // a list of the collection's tags to filter by. On phones, too narrow for
  // the switch beside the toggle, it moves down beside the filter.
  makeTools() {
    this.views = Object.assign(document.createElement('div'), { className: 'works-views' });
    this.views.setAttribute('role', 'group');
    this.views.setAttribute('aria-label', 'View');
    this.views.innerHTML = '<span class="works-views-pill" aria-hidden="true"></span>'
      + '<button type="button" data-view="row">row</button>'
      + '<button type="button" data-view="sheet">sheet</button>';
    const tools = Object.assign(document.createElement('div'), { className: 'works-tools' });
    tools.innerHTML = '<div class="works-filter">'
      + '<button class="works-filter-button" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="works-filter-list">'
      + '<span class="works-filter-label">all</span><span class="works-filter-caret" aria-hidden="true"></span></button>'
      + '<div class="works-filter-list" id="works-filter-list" role="menu" aria-label="Filter by tag" hidden></div></div>';
    this.nav.after(tools);
    this.tools = tools;
    this.placeViews();
    this.viewButtons = [...this.views.querySelectorAll('[data-view]')];
    for (const button of this.viewButtons) button.addEventListener('click', () => this.setView(button.dataset.view));
    this.filterButton = tools.querySelector('.works-filter-button');
    this.filterList = tools.querySelector('.works-filter-list');
    this.filterButton.addEventListener('click', () => (this.filterOpen ? this.closeFilter() : this.openFilter()));
    const { signal } = this.lifetime;
    document.addEventListener('pointerdown', event => {
      if (this.filterOpen && !tools.querySelector('.works-filter').contains(event.target)) this.closeFilter();
    }, { signal });
    this.filterList.addEventListener('keydown', event => {
      const items = [...this.filterList.querySelectorAll('button')];
      const at = items.indexOf(document.activeElement);
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      items[(at + step + items.length) % items.length].focus();
    });
    this.markView();
    this.renderFilter();
    return tools;
  }

  // The sheet takes the clock's place: it fades away there and back for the
  // row, or as the works view closes.
  syncClock({ away = this.isOpen && this.sheet } = {}) {
    document.body.classList.toggle('works-sheet', away);
    document.getElementById('portfolio-clock')?.toggleAttribute('aria-hidden', away);
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
    const chromium = navigator.userAgentData?.brands?.some(brand => brand.brand === 'Chromium');
    if (chromium && !document.getElementById('works-aberration-0')) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      defs.setAttribute('class', 'works-veil-filters');
      defs.setAttribute('aria-hidden', 'true');
      const channel = (row, offset, name) => `<feColorMatrix in="SourceGraphic" type="matrix" values="${row}" result="${name}"/>`
        + (offset ? `<feOffset in="${name}" dx="${offset}" result="${name}"/>` : '');
      defs.innerHTML = WORKS_VEIL.layers.map(({ split }, level) =>
        `<filter id="works-aberration-${level}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`
        + channel('1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', -split, 'red')
        + channel('0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 0, 'green')
        + channel('0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', split, 'blue')
        + '<feBlend in="red" in2="green" mode="screen" result="rg"/><feBlend in="rg" in2="blue" mode="screen"/></filter>').join('');
      document.body.append(defs);
    }
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
    const above = this.sheet && at > 2, below = this.sheet && at < max - 2;
    if (above !== this.scrolled) this.root.classList.toggle('is-scrolled', this.scrolled = above);
    if (below !== this.more) this.root.classList.toggle('has-more', this.more = below);
  }

  // The view switch: in the top bar, or on phones under it, before the filter.
  placeViews() {
    if (this.stacked) { if (this.views.parentElement !== this.tools) this.tools.prepend(this.views); }
    else if (this.views.parentElement !== this.nav) this.nav.append(this.views);
  }

  markView() {
    for (const button of this.viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === this.view));
    const chosen = this.viewButtons.find(button => button.dataset.view === this.view);
    this.views.style.setProperty('--pill-left', `${chosen.offsetLeft - this.viewButtons[0].offsetLeft}px`);
    this.views.style.setProperty('--pill-width', `${chosen.offsetWidth}px`);
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
    this.tools.classList.add('is-filtering');
    if (!this.reduced) this.filterList.animate([{ opacity: 0, transform: 'translateY(-4px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    (this.filterList.querySelector('[aria-checked="true"]') ?? this.filterList.firstChild).focus({ preventScroll: true });
  }

  closeFilter({ focus = false } = {}) {
    if (!this.filterOpen) return;
    this.filterOpen = false;
    this.filterList.hidden = true;
    this.filterButton.setAttribute('aria-expanded', 'false');
    this.tools.classList.remove('is-filtering');
    if (focus) this.filterButton.focus({ preventScroll: true });
  }

  setView(view) {
    if (view === this.view || this.busy) return;
    this.relayout(() => {
      this.view = view;
      this.markView();
      this.root.classList.toggle('is-sheet', this.sheet);
      this.syncClock();
    });
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
    change();
    const keep = entry => !this.filter || entry.work.tags.includes(this.filter);
    if (!this.reduced && this.filter !== was) {
      const going = this.items.filter(entry => before.has(entry) && !keep(entry));
      await Promise.all(going.map(entry => entry.item.animate([{ opacity: 1 }, { opacity: 0 }], { duration: EXPLORATION_VIEW.leave, easing: 'ease', fill: 'forwards' }).finished.catch(() => {})));
      for (const entry of going) entry.item.getAnimations().forEach(animation => animation.cancel());
    }
    // The cards keep their dithers, stretched a moment, while they move.
    this.layout({ dither: false });
    this.scroller.scrollLeft = this.scroller.scrollTop = 0;
    this.updateRow();
    this.updateVeils();
    // Each card's roll at its new place, set now, so every move below runs to
    // it and a rolled card keeps its curve all the way, never flattening.
    this.taper();
    let longest = EXPLORATION_VIEW.move;
    if (!this.reduced) {
      const { move, leave, enter, stagger } = EXPLORATION_VIEW;
      const ease = 'cubic-bezier(.22, 1, .36, 1)', screen = { width: innerWidth, height: innerHeight };
      // Every frame has the same functions, the roll last and unchanged, so
      // only the offset and size between ease; all about the card's middle.
      const at = (dx, dy, sx = 1, sy = 1, roll = '') => `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})${roll ? ` ${roll}` : ''}`;
      const middle = rect => [rect.left + rect.width / 2, rect.top + rect.height / 2];
      let settling = 0;
      for (const entry of this.shown) {
        const from = before.get(entry), to = entry.item.getBoundingClientRect();
        const kind = cardMove(from, to, screen);
        if (kind === 'none') continue;
        const roll = entry.tapered || '', origin = '50% 50%';
        const [tx, ty] = middle(to);
        const held = from && (([fx, fy]) => at(fx - tx, fy - ty, from.width / to.width, from.height / to.height, roll))(middle(from));
        const rest = at(0, 0, 1, 1, roll), lowered = at(0, 10, 1, 1, roll);
        if (kind === 'glide') {
          entry.item.animate([
            { transformOrigin: origin, transform: held },
            { transformOrigin: origin, transform: rest },
          ], { duration: move, easing: ease });
          continue;
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
      }
    }
    this.keepPainting(longest + 100);
    this.busy = false;
    // Then, one card at a time in quiet moments, each is dithered at its new
    // size (or shown at once from one it had before), those in view first.
    const layout = this.shown;
    await new Promise(resolve => setTimeout(resolve, this.reduced ? 0 : longest));
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
      this.glitcher.show(entry.photo, image.clientWidth, image.clientHeight, Math.min(devicePixelRatio || 1, 2), this.ditherOf(entry));
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
    const centre = this.scroller.scrollLeft + innerWidth / 2;
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
    const max = this.scroller.scrollWidth - this.scroller.clientWidth, at = this.scroller.scrollLeft;
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
    this.updateRow();
    this.taper();
    let moving = this.gliding || now < (this.paintUntil ?? 0);
    // Only a card hovered, pressed or still settling moves; the rest lie flat
    // and are not measured. Read those cards' places before writing
    // transforms. Native images travel with their paper frame without a
    // separate rendering layer.
    const resting = entry => entry !== this.active && !entry.pressed && !entry.pose.rx && !entry.pose.ry && entry.pose.scale === 1;
    const live = this.items.filter(entry => !resting(entry));
    const places = new Map(live.map(entry => [entry, entry.item.getBoundingClientRect()]));
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

  // Rolls the stamps nearing the sheet's top and bottom edges over their
  // cylinders (SHEET_TAPER), from the sheet's own sums: where each card was
  // laid out and how far the sheet has scrolled. Anywhere else, and off the
  // sheet, they lie flat.
  taper() {
    const { roll, perspective } = SHEET_TAPER;
    const zone = this.sheet && !this.reduced ? this.taperZone ?? 0 : 0;
    const at = zone ? this.scroller.scrollTop : 0, height = innerHeight, radius = zone / roll;
    const shown = new Map(this.shown.map((entry, index) => [entry, this.cards?.[index]]));
    for (const entry of this.items) {
      let transform = '';
      const card = zone && shown.get(entry);
      if (card) {
        const centre = card.y - at + card.h / 2;
        const up = zone - centre, down = centre - (height - zone);
        // Under a pixel in is flat: the scroll stops on whole pixels, and
        // the last line, resting at the curl's start, must not tip a hair.
        const past = Math.max(up, down);
        if (past > 1) {
          const { angle, slide, sink } = rollAt(past, radius);
          // Over the top its top edge tips away; over the bottom, its bottom.
          const sign = up >= down ? 1 : -1;
          transform = `perspective(${perspective}px) translate3d(0, ${(sign * slide).toFixed(2)}px, ${(-sink).toFixed(2)}px) rotateX(${(sign * angle * 180 / Math.PI).toFixed(2)}deg)`;
        }
      }
      if (entry.tapered === transform) continue;
      entry.tapered = transform;
      entry.item.style.transform = transform;
      entry.item.style.transformOrigin = transform ? '50% 50%' : '';
    }
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
    if (!this.cards) return;
    const card = this.cards[clamp(index, 0, this.cards.length - 1)];
    const at = this.gliding ? this.glideTarget : this.scroller[this.scrollAxis];
    if (this.sheet) this.glideBy(card.y + card.h / 2 - this.scroller.clientHeight / 2 - at);
    else this.glideBy(card.x + card.w / 2 - innerWidth / 2 - at);
  }

  activate(entry) {
    if (this.active === entry) return;
    this.active = entry;
    this.root.classList.toggle('has-active', Boolean(entry));
    for (const item of this.items) item.item.classList.toggle('is-active', item === entry);
    this.paint();
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
    const closeup = this.closeups[`${this.collection}:${this.filter ?? ''}`] ??= mountCloseup({
      images: items.map(({ work }) => ({ src: work.image, width: work.width, height: work.height, alt: work.alt })),
      motionPreference: this.motionPreference,
      sourceOf: index => items[index].frame,
      onIndex: index => this.jumpTo(index),
      onClose: () => {},
    });
    this.activate(null);
    closeup.open(items.indexOf(entry));
  }

  // Straight to a card, unseen, under the close-up.
  jumpTo(index) {
    const card = this.cards?.[index];
    if (!card) return;
    this.gliding = false;
    if (this.sheet) this.scroller.scrollTop = clamp(card.y + card.h / 2 - this.scroller.clientHeight / 2, 0, this.scrollMax);
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

