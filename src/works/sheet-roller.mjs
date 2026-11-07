// The sheet's top and bottom edges as a roller (gallery.mjs, exploration).
//
// The sheet is one flexible surface. Between its two curl lines it lies flat;
// past them it wraps over a cylinder, as paper does over a roller, away from
// the eye, and goes out of sight behind it beyond the crest. A card there is
// not turned as a stiff tile: it is drawn as thin horizontal strips, each
// placed on the curve by where its own two edges lie on it, so neighbouring
// strips share their edges exactly, a card bends across the curl line, the
// room between two lines bends with them, and nothing gaps or overlaps. One
// eye sees it all from the middle of the screen, so every line narrows
// evenly toward the crest and stays level. The strips are not shaded: a
// filter on each, redrawn every frame, cost the scroll its smoothness, and
// under the veils the shade barely showed.
//
// A strip is a slice across a whole line of cards, so a line of four costs
// what one card would. The strips are moved by the scroll itself, not by
// script: each follows its line's place in the sheet's scroll through one
// shared set of keyframes (a scroll-driven animation), so the browser's
// compositor moves them in step with the sheet, frame for frame, however fast
// it is flung, and nothing is worked out per frame. They are made once and,
// for a sheet of up to ROLLER.always strips, all run all the time: switching
// strips on and off as lines come and go cost the scroll a frame now and
// then. A longer sheet runs only the strips of lines near the roller. The sheet itself shows only between the
// curl lines; past them, the strips. Where the browser cannot drive
// animations by the scroll, or motion is reduced, the sheet stays flat.

export const ROLLER = Object.freeze({
  sag: .6,            // px the flat strips may part from the true curve, at most
  overlap: .75,       // px each strip reaches over the next, so no seam shows
  perspective: 900,   // px from the eye, which sits at the screen's middle
  sample: 12,         // px of the sheet between the roll's keyframes
  always: 240,        // strips that may all run at once, made once and never switched
});

// The roller's radius when its curl line lies `top` px in from the screen's
// edge, on a screen `height` px tall: as large as lets its crest, seen from
// the eye, meet that edge, so the sheet runs on over it to the very top.
export function rollerRadius(top, height, perspective = ROLLER.perspective) {
  // Past a screen about 1.6 times the eye's distance tall, the crest cannot
  // reach the edge without the roller growing without bound: it stops at
  // five times the curl line's distance from the edge.
  return top * perspective / Math.max(perspective / 5, perspective - height / 2);
}

// Where a point `y` px down the flat sheet's screen lies once rolled: down
// the screen (`y`), back from it (`z`, negative, away from the eye) and how
// far round (`angle`, radians). Between the curl lines `top` and `bottom` it
// lies where it is.
export function rollPoint(y, { top, bottom, radius }) {
  if (!(radius < Infinity)) return { y, z: 0, angle: 0 };
  const past = y < top ? top - y : y > bottom ? y - bottom : 0;
  if (!past) return { y, z: 0, angle: 0 };
  const angle = past / radius, along = radius * Math.sin(angle), z = -radius * (1 - Math.cos(angle));
  return { y: y < top ? top - along : bottom + along, z, angle };
}

// The strip of the flat sheet from `upper` to `lower` px down the screen,
// rolled: its upper edge's place, the tilt about it that carries it to its
// lower edge's, how much it stretches or shortens to reach it, how far round
// its middle is, and whether that is beyond the crest, out of sight.
export function placeStrip(upper, lower, edges) {
  const a = rollPoint(upper, edges), b = rollPoint(lower, edges);
  const dy = b.y - a.y, dz = b.z - a.z;
  const angle = rollPoint((upper + lower) / 2, edges).angle;
  return {
    y: a.y, z: a.z,
    tilt: Math.atan2(dz, dy),
    scale: Math.hypot(dy, dz) / Math.max(1e-6, lower - upper),
    angle,
    hidden: angle >= Math.PI / 2,
  };
}

// How tall each strip is on a roller of `radius`: as tall as keeps it within
// ROLLER.sag px of the curve it stands for, so its straight edges never show.
// Fewer strips cost the page less.
export function stripHeight(radius) {
  return radius < Infinity ? Math.max(6, Math.min(48, Math.floor(2 * radius * Math.acos(1 - ROLLER.sag / radius)))) : Infinity;
}

// The copies of a card `y` px down the sheet and `height` tall that show on
// a sheet scrolled `scroll` px, repeating every `period` px (0: once), within
// `from` to `to` px down the screen: each as [copy, its top on the screen].
export function copiesOf(y, height, { scroll, period, from, to }) {
  if (!period) return y - scroll < to && y - scroll + height > from ? [[0, y - scroll]] : [];
  const copies = [];
  for (let copy = Math.ceil((from - height - y + scroll) / period); ; copy++) {
    const top = y + copy * period - scroll;
    if (top >= to) break;
    if (top + height > from) copies.push([copy, top]);
  }
  return copies;
}

// The roll as keyframes for a strip `strip` px tall, whose top runs from
// beyond the bottom crest (offset 0) to beyond the top crest (offset 1),
// `span` px of the sheet: its place on the roller, sampled every
// `sample` px past the curl lines; the flat run between them needs only its
// ends. It shows only past a curl line (between them the sheet itself shows)
// and short of the crest.
export function rollKeyframes({ top, bottom, radius, strip, sample = ROLLER.sample }) {
  const edges = { top, bottom, radius }, reach = radius * Math.PI / 2;
  const from = bottom + reach, to = top - reach - strip, span = from - to;
  const lowCrest = bottom + reach - strip / 2, highCrest = top - reach - strip / 2;
  const points = new Set([from, lowCrest, bottom - strip, top, highCrest, to]);
  for (let y = lowCrest - sample; y > bottom - strip; y -= sample) points.add(y);
  for (let y = top - sample; y > highCrest; y -= sample) points.add(y);
  const ys = [...points].sort((a, b) => b - a);
  const shows = y => (y < top || y + strip > bottom) && y + strip / 2 < bottom + reach && y + strip / 2 > top - reach;
  const frames = [];
  ys.forEach((y, index) => {
    const placed = placeStrip(y, y + strip, edges);
    const frame = {
      offset: (from - y) / span,
      transform: `translate3d(0px, ${placed.y.toFixed(3)}px, ${placed.z.toFixed(3)}px) rotateX(${placed.tilt.toFixed(5)}rad) scaleY(${placed.scale.toFixed(5)})`,
    };
    const before = shows(index ? (ys[index - 1] + y) / 2 : y + .01);
    const after = shows(index < ys.length - 1 ? (y + ys[index + 1]) / 2 : y - .01);
    frames.push({ ...frame, opacity: before ? 1 : 0 });
    // Where it comes into sight or goes, at once.
    if (after !== before) frames.push({ ...frame, offset: frame.offset + 1e-7, opacity: after ? 1 : 0 });
  });
  return { frames, span };
}

// Whether this browser can drive animations by the scroll, with the named
// timelines the roller shares out of the sheet.
export const scrollDriven = () => typeof CSS !== 'undefined'
  && CSS.supports('timeline-scope', '--a') && CSS.supports('animation-timeline', '--a')
  && CSS.supports('animation-range', 'cover 1px cover 2px') && CSS.supports('view-timeline-inset', '-1px -1px');

// Whether the roller runs here: where the browser drives it by the scroll on
// its compositor, as Chromium does, measured frame by frame. Elsewhere the
// sheet stays flat, which scrolls as any page does.
export const rollsSmoothly = () => scrollDriven()
  && Boolean(globalThis.navigator?.userAgentData?.brands?.some(brand => brand.brand === 'Chromium'));

// The roller, and the sheet's ghosts. While the edges roll, each line of the
// sheet has its strips, under the sheet, following the place in the scroll of
// a mark on the sheet (its view timeline); an endless sheet shows a line again
// a time round further on, so a line may have a few copies, each its own mark
// and strips. Separately, where an endless sheet shows a card twice between
// the curl lines, its other copy is a ghost: an inert likeness on the sheet.
export class SheetRoller {
  constructor(root) {
    this.root = root;
    this.scroller = root.querySelector('.works-scroll');
    this.wall = this.scroller.querySelector('.works-wall');
    this.layer = Object.assign(document.createElement('div'), { className: 'sheet-roller' });
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.inert = true;
    this.layer.style.perspective = `${ROLLER.perspective}px`;
    // Under the sheet: the cards between the curl lines cover their strips.
    this.scroller.before(this.layer);
    this.sheet = document.createElement('style');
    document.head.append(this.sheet);
    // Every line copy's timeline is named, and the names shared out of the
    // sheet; a name is given back when its copy goes, for the next.
    this.names = [];
    this.spare = [];
    this.lines = [];
    this.copies = [];
    this.ghosts = new Map();
    this.rolling = null;
    this.key = null;
    this.ghostKey = null;
  }

  // Readies the roller for a new layout: `lines` ({ entries, cards, y, tall }:
  // the cards of each line of the sheet, where it lies in one time round, and
  // how tall it is); `roll` ({ top, bottom, radius, height }), the curl lines
  // and the screen's height, when the edges roll. A new layout makes every
  // strip again; a new size, every ghost.
  setup({ lines = [], roll = null } = {}) {
    const first = lines[0]?.cards[0];
    const ghostKey = first ? `${innerWidth}x${innerHeight}:${first.w}x${lines[0].tall}` : null;
    if (ghostKey !== this.ghostKey) {
      this.ghostKey = ghostKey;
      for (const list of this.ghosts.values()) list.forEach(ghost => ghost.box.remove());
      this.ghosts.clear();
    }
    const key = roll && first ? `${ghostKey}:${lines.map(line => `${line.y}:${line.entries.map(entry => entry.index).join('.')}`).join('|')}:${roll.top}:${roll.bottom}:${roll.radius.toFixed(3)}` : null;
    if (key !== this.key) {
      this.key = key;
      for (const list of this.copies) list.forEach(copy => this.unmake(copy));
      this.copies = lines.map(() => []);
      this.lines = lines;
      this.rolling = key ? this.prepare(roll, lines[0].tall) : null;
    }
    this.root.classList.toggle('is-rolling', Boolean(this.rolling));
    if (this.rolling) {
      this.root.style.setProperty('--curl-top', `${roll.top}px`);
      this.root.style.setProperty('--curl-bottom', `${roll.bottom}px`);
    }
  }

  // The keyframes, and the view each line copy's strips follow: from its top
  // at the bottom crest until its last strip is past the top crest.
  prepare(roll, tall) {
    const strip = stripHeight(roll.radius);
    const count = Math.ceil(tall / strip), reach = roll.radius * Math.PI / 2;
    const { frames, span } = rollKeyframes({ ...roll, strip });
    this.sheet.textContent = `@keyframes sheet-roll {${frames.map(frame =>
      `${(frame.offset * 100).toFixed(5)}%{transform:${frame.transform};opacity:${frame.opacity}}`).join('')}}`;
    const above = roll.top - reach - (count * strip - tall), below = roll.height - roll.bottom - reach;
    // Every line runs, on a sheet that ends and is short enough; else a line
    // copy runs while it is anywhere from a screen beyond the bottom crest to
    // a screen beyond the top one, readied and put away well out of sight.
    const always = this.lines.length * count <= ROLLER.always;
    const near = { from: roll.top - reach - strip - roll.height, to: roll.bottom + reach + roll.height };
    return { strip, count, span, always, near, inset: `${above.toFixed(2)}px ${below.toFixed(2)}px` };
  }

  // Runs the strips of each line copy near the roller, for a sheet scrolled
  // `scroll` px that comes round every `period` px (0: once).
  place(scroll, period) {
    if (!this.rolling) return;
    const { always, near: window } = this.rolling;
    const sight = always && !period ? { from: -Infinity, to: Infinity } : window;
    this.lines.forEach((line, index) => {
      const list = this.copies[index];
      const near = copiesOf(line.y, line.tall, { scroll, period, from: sight.from, to: sight.to });
      near.forEach(([round], at) => {
        const copy = list[at] ??= this.make(line);
        const top = line.y + round * period;
        if (copy.top !== top) copy.mark.style.top = `${copy.top = top}px`;
        if (copy.parked) this.show(copy, true);
      });
      list.slice(near.length).forEach(copy => { if (!copy.parked) this.show(copy, false); });
    });
  }

  show(copy, shown) {
    copy.parked = !shown;
    copy.mark.hidden = !shown;
    copy.strips.forEach(element => { element.hidden = !shown; });
  }

  // A line copy: its mark on the sheet, and its strips, each a window across
  // likenesses of the line's cards.
  make(line) {
    const { strip, count, span, inset } = this.rolling;
    const name = this.name();
    const mark = Object.assign(document.createElement('div'), { className: 'sheet-roller-mark' });
    mark.setAttribute('aria-hidden', 'true');
    mark.style.height = `${line.tall}px`;
    mark.style.setProperty('view-timeline', `${name} block`);
    mark.style.setProperty('view-timeline-inset', inset);
    this.wall.append(mark);
    const faces = line.entries.map((entry, at) => {
      const face = entry.link.cloneNode(true);
      face.removeAttribute('href');
      face.removeAttribute('tabindex');
      face.removeAttribute('style');
      face.className = 'sheet-roller-face';
      for (const node of face.querySelectorAll('canvas, .works-seal')) node.remove();
      const frame = face.querySelector('.works-frame');
      // A likeness made while its card is up close is not hidden with it.
      if (frame) { frame.style.transform = ''; frame.classList.remove('is-closeup-source'); }
      Object.assign(face.style, { left: `${line.cards[at].x}px`, width: `${line.cards[at].w}px` });
      return face;
    });
    const images = new Map(line.entries.map(entry => [entry, []]));
    const strips = [];
    for (let index = 0; index < count; index++) {
      const element = Object.assign(document.createElement('div'), { className: 'sheet-roller-strip' });
      element.style.height = `${strip + ROLLER.overlap}px`;
      element.style.animation = 'sheet-roll linear both';
      element.style.setProperty('animation-timeline', name);
      element.style.setProperty('animation-range', `cover ${index * strip}px cover ${index * strip + span}px`);
      line.entries.forEach((entry, at) => {
        const piece = index ? faces[at].cloneNode(true) : faces[at];
        piece.style.top = `${-index * strip}px`;
        element.append(piece);
        images.get(entry).push(...piece.querySelectorAll('img'));
      });
      strips.push(element);
    }
    this.layer.append(...strips);
    return { mark, name, strips, images, top: null, parked: false };
  }

  unmake(copy) {
    copy.mark.remove();
    copy.strips.forEach(element => element.remove());
    this.spare.push(copy.name);
  }

  name() {
    if (this.spare.length) return this.spare.pop();
    const name = `--works-line-${this.names.length}`;
    this.names.push(name);
    this.root.style.setProperty('timeline-scope', this.names.join(', '));
    return name;
  }

  // Places `entry`'s ghosts at `tops` (px down the wall), its card `card`
  // ({ x, w }) as laid out; any it had beyond those go.
  ghost(entry, card, tops) {
    const list = this.ghosts.get(entry) ?? this.ghosts.set(entry, []).get(entry);
    tops.forEach((top, index) => {
      const ghost = list[index] ??= this.likeness(entry);
      if (ghost.top !== top) ghost.box.style.top = `${ghost.top = top}px`;
      if (ghost.left !== card.x) Object.assign(ghost.box.style, { left: `${ghost.left = card.x}px`, width: `${card.w}px` });
      if (ghost.box.hidden) ghost.box.hidden = false;
    });
    list.slice(tops.length).forEach(ghost => { if (!ghost.box.hidden) ghost.box.hidden = true; });
  }

  // An inert likeness of the card, on the sheet.
  likeness(entry) {
    const box = entry.item.cloneNode(true);
    box.classList.add('works-ghost');
    box.classList.remove('is-active');
    box.inert = true;
    box.setAttribute('aria-hidden', 'true');
    for (const node of box.querySelectorAll('canvas, .works-seal')) node.remove();
    box.style.removeProperty('view-timeline');
    box.style.removeProperty('view-timeline-inset');
    const frame = box.querySelector('.works-frame');
    if (frame) { frame.style.transform = ''; frame.classList.remove('is-closeup-source'); }
    this.wall.append(box);
    return { box, images: [...box.querySelectorAll('img')], top: null, left: null };
  }

  // Hides every ghost: off the sheet, or for a layout without them.
  clearGhosts() {
    for (const list of this.ghosts.values()) list.forEach(ghost => { if (!ghost.box.hidden) ghost.box.hidden = true; });
  }

  // The card's photo changed: its likenesses take it too.
  refresh(entry) {
    const src = entry.image.getAttribute('src');
    const images = [...(this.ghosts.get(entry) ?? []).flatMap(ghost => ghost.images)];
    for (const list of this.copies) for (const copy of list) images.push(...(copy.images.get(entry) ?? []));
    for (const image of images) if (image.getAttribute('src') !== src) image.setAttribute('src', src);
  }

  // Faded out as the cards that go fade, kept out of sight while the rest
  // move after a relayout, then faded back in (works.css).
  hold() {
    this.layer.classList.add('is-held');
  }

  release() {
    this.layer.classList.remove('is-held');
  }
}
