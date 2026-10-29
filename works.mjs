import { GRID } from './model.mjs';
import { paperFlipKeyframes } from './paper-flip.mjs';
import { WORKS, EXPLORATION } from './works-data.mjs';
import { clockTextLayout } from './clock.mjs';
import { paperTarget, advancePaper } from './paper-motion.mjs';
import { projectHref, transitionToProject } from './project-transition.mjs';
import { STAMP, stampShape, stampOutline, createPostageStamp } from './postage-stamp.mjs';
import { WaxInteraction } from './wax-interaction.mjs';
export { STAMP, stampShape } from './postage-stamp.mjs';

// The paper turns away using the first half of its own flip and is gone
// when edge-on; it returns through the second half, from the other side.
export const PAPER_AWAY = Object.freeze({ duration: 560 });
export const WORKS_MOTION = Object.freeze({ fade: 280 });
// One card per column, leaning top, bottom, bottom, top, top, ...
export const shelfAt = index => ((index + 1) >> 1) % 2 ? 'bottom' : 'top';
// Each card sits at its own height within its shelf, the same on every visit.
const scatter = (index, salt) => {
  const n = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
export const placement = index => ({ lift: scatter(index, 3), shift: scatter(index, 5) });
// How far a photo slides inside its window as the row scrolls, as a share of
// the card's width either way.
export const PHOTO_PARALLAX = .14;
// Guards for the works row on tablets and desktops. Cards are `share` of the
// screen's width, never under `min` pixels and never taller than `tallest`
// of the height above the clock; every card but the first settles `settle`
// of that height lower; and no two cards come within `gap` pixels of
// overlapping. Upright screens hold the rows in a band `uprightBand` cards
// tall. Phones and tablets (up to `tabletUpTo` wide) use fixed card widths.
export const CARD_GUARD = Object.freeze({
  share: .3, min: 260, tallest: .42, settle: .06, gap: 20, uprightBand: 2.8,
  label: 36,   // room under a stamp for its password label
  tablet: 380, tabletUpTo: 1024, phone: 300,
});
// Wheel scrolling glides toward where the wheel has sent it.
export const WHEEL_GLIDE = 140;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function halfFlipKeyframes(half) {
  const frames = half === 'away' ? paperFlipKeyframes(0, 180) : paperFlipKeyframes(-180, 0);
  return frames
    .filter(frame => half === 'away' ? frame.offset <= .5 : frame.offset >= .5)
    .map(frame => ({ ...frame, offset: half === 'away' ? frame.offset * 2 : frame.offset * 2 - 1 }));
}

export const clockLabel = (work, short = false) => {
  const from = Math.floor(work.start), to = work.end ? Math.floor(work.end) : 'now';
  const years = from === to ? String(from) : `${from}-${to}`;
  return `${work.title}${short ? '' : ` ${years}`}`.toUpperCase().replace(/[^A-Z0-9 -]/g, '').replace(/\s+/g, ' ').trim();
};

export const yearLabel = work => {
  const from = Math.floor(work.start), to = work.end ? Math.floor(work.end) : 'now';
  return from === to ? String(from) : `${from}—${to === 'now' ? to : String(to).slice(2)}`;
};

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
    this.active = null;
    this.collections = collections;
    this.collection = 'works';
    this.items = collections.works.map((work, index) => this.createItem(work, index));
    // Each collection's cards are made once and kept.
    this.built = { works: this.items };
    // Along the top: the way back to the paper, and a toggle between the
    // selected works and exploration.
    this.nav = root.querySelector('.works-nav');
    this.nav.querySelector('.works-nav-back').addEventListener('click', () => this.close());
    this.toggles = [...this.nav.querySelectorAll('[data-collection]')];
    for (const toggle of this.toggles) toggle.addEventListener('click', () => this.show(toggle.dataset.collection));
    // Above the clock: a dot per stamp, the current one filled; a dot glides
    // the row to its stamp.
    this.dots = Object.assign(document.createElement('nav'), { className: 'works-dots' });
    this.dots.setAttribute('aria-label', 'Works');
    root.append(this.dots);
    frontSeal.addEventListener('click', () => this.open());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.isOpen) this.close();
    });
    addEventListener('popstate', () => {
      if (location.pathname.endsWith('/ocean.html')) return;
      if ((location.hash === '#works') !== this.isOpen) location.hash === '#works' ? this.open({ history: false }) : this.close({ history: false });
    });
    addEventListener('resize', () => {
      if (!this.isOpen) return;
      this.layout();
    });
    // The row scrolls sideways, freely. It lies over the cloth without taking
    // its pointer, so the wheel is passed on and the cloth stays stitchable.
    addEventListener('wheel', event => {
      if (!this.isOpen) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      this.glideBy(event.deltaMode === 1 ? delta * 40 : delta);
    }, { passive: false });
    // A native scroll (a swipe, or the keyboard) is drawn in the same frame loop.
    this.scroller.addEventListener('scroll', () => this.paint(), { passive: true });
  }

  get reduced() { return this.motionPreference.matches; }
  get stacked() { return innerWidth <= 540; }

  createItem(work, index) {
    const item = document.createElement('li');
    item.className = 'works-item';
    item.dataset.work = work.id;
    item.dataset.shelf = shelfAt(index);
    item.style.setProperty('--i', index);
    const link = document.createElement('a');
    link.className = 'works-link';
    if (work.href) link.href = projectHref(work, location.href);
    else link.setAttribute('aria-disabled', 'true');
    link.tabIndex = 0;
    link.setAttribute('aria-label', `${work.title}, ${work.tags.join(', ')}, ${yearLabel(work)}${work.passwordProtected ? ', password protected' : ''}`);
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
    image.src = work.image;
    // The stamp's paper is drawn once the card's size is known.
    const stamp = createPostageStamp(`works-paper-${work.id}`, 'works-stamp');
    frame.append(picture, stamp, cardText(work));
    // Work with a page shows a wax "details" seal in the middle of its photo
    // on hover: the homepage's seal and its light, without its wax-flow entrance.
    let seal = null;
    if (work.href) {
      const element = Object.assign(document.createElement('span'), { className: 'works-seal works-details' });
      element.setAttribute('aria-hidden', 'true');
      element.innerHTML = '<img src="./assets/works-wax-seal.png" width="2076" height="758" alt="" draggable="false" />'
        + '<span class="works-seal-label">details</span>';
      frame.append(element);
      seal = { element, wax: new WaxInteraction(element, this.motionPreference, { entrance: false }) };
    }
    link.append(frame);
    // Work behind a password says so on a small tag just below the frame.
    if (work.passwordProtected) {
      const tag = Object.assign(document.createElement('span'), { className: 'works-protected', textContent: 'password protected' });
      tag.setAttribute('aria-hidden', 'true');
      link.append(tag);
    }
    item.append(link);
    this.wall.append(item);
    const entry = { work, index, item, link, frame, picture, image, stamp, seal, parallax: 0, pressed: false, pose: paperTarget(), pointer: { x: -1e4, y: -1e4 } };
    image.addEventListener('load', () => this.paint());
    link.addEventListener('pointermove', event => {
      entry.pointer = { x: event.clientX, y: event.clientY };
      this.paint();
    });
    // Pressing a card flattens it a little, like the paper on the homepage.
    const press = pressed => event => {
      if (event.pointerType === 'mouse' && event.button !== 0 && pressed) return;
      entry.pressed = pressed;
      this.paint();
    };
    link.addEventListener('pointerdown', press(true));
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) link.addEventListener(type, press(false));
    link.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') this.activate(entry); });
    link.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') this.activate(null); });
    link.addEventListener('focus', () => {
      if (!link.matches(':focus-visible')) return;
      this.goTo(index);
      this.activate(entry);
    });
    link.addEventListener('blur', () => { if (this.active === entry) this.activate(null); });
    link.addEventListener('click', event => this.choose(entry, event));
    return entry;
  }

  async open({ history = true } = {}) {
    if (this.isOpen || this.busy) return;
    this.busy = true;
    if (history && location.hash !== '#works') window.history.pushState({ works: true }, '', '#works');
    this.scene.setPaperPresent(false);
    this.paper.inert = true;
    this.paper.dispatchEvent(new CustomEvent('paperflipstart'));
    await this.turnPaper('away');
    this.paper.style.visibility = 'hidden';
    this.isOpen = true;
    this.root.hidden = false;
    this.layout();
    this.scroller.scrollLeft = 0;
    this.paint();
    // Lay the cards out, then let them settle onto the cloth in turn.
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.keepPainting(this.items.length * 80 + 700);
    this.busy = false;
    (this.items.find(entry => entry.work.href) ?? this.items[0]).link.focus({ preventScroll: true, focusVisible: false });
  }

  async close({ history = true } = {}) {
    if (!this.isOpen || this.busy) return;
    this.busy = true;
    this.activate(null);
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
    await this.turnPaper('back');
    this.paper.inert = false;
    this.scene.setPaperPresent(true);
    this.paper.dispatchEvent(new CustomEvent('paperflipend', { detail: { red: false } }));
    this.busy = false;
    this.frontSeal.focus({ preventScroll: true });
  }

  // Swaps the row for another collection: the cards fade out, the new ones
  // are laid out from the start of the row and settle in, in turn.
  async show(collection) {
    if (collection === this.collection || this.busy || !this.collections[collection]) return;
    this.busy = true;
    this.collection = collection;
    for (const toggle of this.toggles) toggle.setAttribute('aria-pressed', String(toggle.dataset.collection === collection));
    this.activate(null);
    this.root.classList.add('is-swapping');
    this.keepPainting(WORKS_MOTION.fade + 100);
    await new Promise(resolve => setTimeout(resolve, this.reduced ? 0 : WORKS_MOTION.fade));
    for (const entry of this.items) entry.item.remove();
    this.items = this.built[collection] ??= this.collections[collection].map((work, index) => this.createItem(work, index));
    for (const entry of this.items) this.wall.append(entry.item);
    this.gliding = false;
    this.layout();
    this.scroller.scrollLeft = 0;
    // Let the new cards be drawn hidden once, so they arrive in turn.
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('is-swapping')));
    this.keepPainting(this.items.length * 80 + 700);
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

  layout() {
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
    // The dots sit three rows above the clock, and the stamps stop three rows
    // above the dots, so the space above the dots matches the space below.
    if (this.dotsFor !== this.items) this.renderDots();
    this.dots.style.top = `${clockTop - 3 * pitch}px`;

    // Cards lean to the top or the bottom of the space between the top bar
    // and the clock, each at its own height there; all share one size.
    const top = snapRow(this.nav.getBoundingClientRect().bottom + (stacked ? 16 : 24));
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
    // Every card shares one size, so one stamp outline serves them all. The
    // photo fills the whole stamp, cut to its perforations, over the paper;
    // the text keeps to where the paper's margin would be.
    this.window = stampShape(w, h, perf);
    const outline = stampOutline(w, h, perf);
    for (const entry of this.items) {
      entry.stamp.setAttribute('viewBox', `0 0 ${w} ${h}`);
      entry.stamp.lastChild.setAttribute('d', outline);
      entry.picture.style.clipPath = `path('${outline}')`;
      entry.frame.style.setProperty('--inset', `${this.window.inset}px`);
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
    this.items.forEach((entry, index) => {
      // The last two cards close the row with a zig-zag rather than half a
      // pair: each takes the shelf opposite the card before it, out at that
      // shelf's far edge.
      const closing = Boolean(previous) && index >= this.items.length - 2;
      const shelf = closing ? (previous.shelf === 'top' ? 'bottom' : 'top') : shelfAt(index);
      const { lift, shift } = placement(index);
      entry.item.dataset.shelf = shelf;
      // Opposite shelves tuck into each other; the same shelf keeps apart.
      if (previous) x += previous.w * (shelf === previous.shelf ? 1.06 : .72) + (shift - .5) * w * .12;
      // The first card holds its place; the rest settle a little lower,
      // into the room below, except the closing pair at the edges.
      const settle = index && !closing ? available * CARD_GUARD.settle : 0;
      const reach = closing ? 0 : room * lift * .3;
      let y = shelf === 'top' ? bandTop + reach + settle : bandTop + band - h - reach;
      // A password label hangs below its stamp and counts as part of it.
      const tail = entry.work.passwordProtected ? CARD_GUARD.label : 0;
      y = snapRow(clamp(y, top, bottom - h - tail), Math.floor);
      // On the cloth's grid, like every stitch.
      x = snapCol(x, Math.round);
      // Overlap guard: a card never covers one placed before it; if it would,
      // it moves right until there is a clear gap.
      for (let moved = true; moved;) {
        moved = false;
        for (const other of this.cards) {
          const overlaps = x < other.x + other.w + CARD_GUARD.gap && other.x < x + w + CARD_GUARD.gap
            && y < other.y + other.h + other.tail + CARD_GUARD.gap && other.y < y + h + tail + CARD_GUARD.gap;
          if (overlaps) { x = snapCol(other.x + other.w + CARD_GUARD.gap, Math.ceil); moved = true; }
        }
      }
      Object.assign(entry.item.style, { left: `${x}px`, top: `${y}px`, width: `${w}px` });
      previous = { x, y, w, h, tail, shelf };
      this.cards.push(previous);
    });
    const end = x + previous.w;
    // The row ends with the same margin it starts with.
    this.wall.style.width = `${end + left}px`;
    this.wall.style.height = `${height}px`;
    this.paint();
  }

  // Each photo's sideways parallax follows the scroll position, worked out
  // from the cards' known places without measuring the page.
  updateRow() {
    if (!this.cards) return;
    const centre = this.scroller.scrollLeft + innerWidth / 2;
    this.cards.forEach((card, index) => {
      const entry = this.items[index];
      entry.parallax = this.reduced ? 0 : -clamp((card.x + card.w / 2 - centre) / innerWidth, -1, 1) * card.w * PHOTO_PARALLAX;
      entry.image.style.translate = `${entry.parallax.toFixed(1)}px 0`;
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
    this.dotsFor = this.items;
    this.current = null;
    this.dots.replaceChildren(...this.items.map((entry, index) => {
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
      this.scroller.scrollLeft = this.glidePosition;
    }
    this.updateRow();
    let moving = this.gliding || now < (this.paintUntil ?? 0);
    // Read every card's place before writing transforms. Native images travel
    // with their paper frame without a separate rendering layer.
    const places = this.items.map(entry => entry.item.getBoundingClientRect());
    this.items.forEach((entry, index) => {
      const anchor = places[index];
      const hovered = entry === this.active;
      // The frame answers the pointer as the homepage paper does: it tilts
      // toward it, lifts a little, and presses flat when clicked.
      const target = paperTarget({
        x: (entry.pointer.x - anchor.left) / anchor.width * 2 - 1,
        y: (entry.pointer.y - anchor.top) / anchor.height * 2 - 1,
        hovered, pressed: entry.pressed, reduced: this.reduced,
      });
      entry.pose = this.reduced ? target : advancePaper(entry.pose, target, elapsed);
      const { rx, ry, scale } = entry.pose;
      entry.frame.style.transform = rx || ry || scale !== 1 ? `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})` : '';
      moving ||= entry.pose.rx !== target.rx || entry.pose.ry !== target.ry || entry.pose.scale !== target.scale;
    });
    if (moving) this.paint();
    else this.painted = null;
  }

  keepPainting(duration) {
    this.paintUntil = performance.now() + duration;
    this.paint();
  }

  // Eases the row toward its target, so wheel steps glide rather than jump.
  glideBy(delta) {
    const max = this.scroller.scrollWidth - this.scroller.clientWidth;
    this.glideTarget = clamp((this.gliding ? this.glideTarget : this.scroller.scrollLeft) + delta, 0, max);
    if (this.reduced) { this.scroller.scrollLeft = this.glideTarget; this.paint(); return; }
    if (!this.gliding) this.glidePosition = this.scroller.scrollLeft;
    this.gliding = true;
    this.paint();
  }

  goTo(index) {
    if (!this.cards) return;
    const card = this.cards[clamp(index, 0, this.cards.length - 1)];
    this.glideBy(card.x + card.w / 2 - innerWidth / 2 - (this.gliding ? this.glideTarget : this.scroller.scrollLeft));
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

  choose(entry, event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
    event.preventDefault();
    if (this.departing) return;
    // Touch has no hover, so a tap opens the work at once, without the seal.
    if (entry.work.href) transitionToProject(this, entry, { seal: event.pointerType !== 'touch' });
    else this.activate(entry);
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

