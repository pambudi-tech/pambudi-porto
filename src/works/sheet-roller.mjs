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
// evenly toward the crest and stays level. Strips shade as they turn away.
//
// The strips are moved by the scroll itself, not by script: each follows its
// card's place in the sheet's scroll through one shared set of keyframes (a
// scroll-driven animation), so the browser's compositor moves them in step
// with the sheet, frame for frame, however fast it is flung, and nothing is
// worked out per frame. The sheet itself shows only between the curl lines;
// past them, the strips. Where the browser cannot drive animations by the
// scroll, or motion is reduced, the sheet stays flat.

export const ROLLER = Object.freeze({
  sag: .6,            // px the flat strips may part from the true curve, at most
  overlap: .75,       // px each strip reaches over the next, so no seam shows
  perspective: 900,   // px from the eye, which sits at the screen's middle
  shade: .3,          // the darkest the paper becomes, turned edge-on to the light
  fade: 280,          // ms the roller takes to come in after a relayout
  sample: 12,         // px of the sheet between the roll's keyframes
  ready: .12,         // of the screen's height: how far ahead of a curl line a strip is readied
});

// The roller's radius when its curl line lies `top` px in from the screen's
// edge, on a screen `height` px tall: as large as lets its crest, seen from
// the eye, meet that edge, so the sheet runs on over it to the very top.
export function rollerRadius(top, height, perspective = ROLLER.perspective) {
  return top * perspective / Math.max(1, perspective - height / 2);
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

// How dark the paper is, turned `angle` radians away from the light, which
// falls from where the eye is.
export function shadeAt(angle) {
  return ROLLER.shade * (1 - Math.cos(Math.min(angle, Math.PI / 2)));
}

// The strip of the flat sheet from `upper` to `lower` px down the screen,
// rolled: its upper edge's place, the tilt about it that carries it to its
// lower edge's, how much it stretches or shortens to reach it, how far round
// its middle is, whether that is beyond the crest, out of sight, and how
// dark each of its edges is, so its shade runs smoothly into its
// neighbours'.
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
    shade: [shadeAt(a.angle), shadeAt(b.angle)],
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
// `span` px of the sheet: its place on the roller and its shade, sampled every
// `sample` px past the curl lines; the flat run between them needs only its
// ends. Beyond a crest a strip faces away and is not drawn; between the curl
// lines the sheet itself covers it.
export function rollKeyframes({ top, bottom, radius, strip, sample = ROLLER.sample }) {
  const edges = { top, bottom, radius }, reach = radius * Math.PI / 2;
  const from = bottom + reach, to = top - reach - strip, span = from - to;
  const points = new Set([from, bottom - strip, top, to]);
  for (let y = from - sample; y > bottom - strip; y -= sample) points.add(y);
  for (let y = top - sample; y > to; y -= sample) points.add(y);
  const frames = [...points].sort((a, b) => b - a).map(y => {
    const placed = placeStrip(y, y + strip, edges);
    return {
      offset: (from - y) / span,
      transform: `translate3d(0px, ${placed.y.toFixed(3)}px, ${placed.z.toFixed(3)}px) rotateX(${placed.tilt.toFixed(5)}rad) scaleY(${placed.scale.toFixed(5)})`,
      filter: `brightness(${(1 - shadeAt(placed.angle)).toFixed(4)})`,
    };
  });
  return { frames, span };
}

// Whether this browser can drive animations by the scroll, with the named
// timelines the roller shares out of the sheet.
export const scrollDriven = () => typeof CSS !== 'undefined'
  && CSS.supports('timeline-scope', '--a') && CSS.supports('animation-timeline', '--a')
  && CSS.supports('animation-range', 'cover 1px cover 2px') && CSS.supports('view-timeline-inset', '-1px -1px');

// The sheet's copies of its cards and their strips. An endless sheet shows a
// card again a time round further on, so a card may show more than once at
// a time: its own card is the copy most in view, and each other copy in or
// near sight is a ghost, an inert likeness of it on the sheet. Each copy,
// while the edges roll, has its strips, under the sheet, following that
// copy's place in the scroll (its view timeline).
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
    this.copies = new Map();
    // Every copy's timeline is named, and the names shared out of the sheet;
    // a ghost's name is given back when it goes, for the next.
    this.names = [];
    this.spare = [];
    this.rolling = null;
    this.key = null;
  }

  // Readies the copies for a new layout of `entries` at `cards`; `roll` ({
  // top, bottom, radius, height }), the curl lines and the screen's height,
  // when the edges roll. Any change of size makes every copy again.
  setup({ entries = [], cards = [], roll = null } = {}) {
    const card = cards.find(Boolean);
    const key = card ? `${innerWidth}x${innerHeight}:${card.w}x${card.h + card.tail}:${roll ? [roll.top, roll.bottom, roll.radius.toFixed(3)] : 'flat'}` : null;
    if (key !== this.key) {
      this.key = key;
      for (const [entry, list] of this.copies) {
        list.forEach(copy => this.unstrip(copy));
        list.slice(1).forEach(copy => {
          copy.box.remove();
          this.spare.push(copy.name);
        });
        this.copies.set(entry, list.slice(0, 1));
      }
      this.rolling = roll && card ? this.prepare(roll, card) : null;
    }
    const shown = new Set(entries);
    for (const [entry, list] of this.copies) if (!shown.has(entry)) list.forEach(copy => this.park(copy));
    this.root.classList.toggle('is-rolling', Boolean(this.rolling));
    if (this.rolling) {
      this.root.style.setProperty('--curl-top', `${roll.top}px`);
      this.root.style.setProperty('--curl-bottom', `${roll.bottom}px`);
    }
  }

  // The keyframes, and the view each copy's strips follow: from its top at
  // the bottom crest until its last strip is past the top crest.
  prepare(roll, card) {
    const strip = stripHeight(roll.radius), tall = card.h + card.tail;
    const count = Math.ceil(tall / strip), reach = roll.radius * Math.PI / 2;
    const { frames, span } = rollKeyframes({ ...roll, strip });
    this.sheet.textContent = `@keyframes sheet-roll {${frames.map(frame =>
      `${(frame.offset * 100).toFixed(5)}%{transform:${frame.transform};filter:${frame.filter}}`).join('')}}`;
    const above = roll.top - reach - (count * strip - tall), below = roll.height - roll.bottom - reach;
    // Only strips at or near the roller run: between the curl lines the
    // sheet itself shows, and every strip running costs the page a little
    // each frame. Each is readied a strip ahead of its curl line; a fling of
    // a finger, which the page hears of late, needs further.
    const ahead = matchMedia('(pointer: coarse)').matches ? Math.max(strip * 2, roll.height * ROLLER.ready) : strip;
    const zones = [[roll.top - reach - strip - ahead, roll.top + ahead], [roll.bottom - strip - ahead, roll.bottom + reach + ahead]];
    return { strip, count, span, zones, inset: `${above.toFixed(2)}px ${below.toFixed(2)}px`, width: card.w };
  }

  // Places `entry`'s copies for a sheet scrolled `scroll` px: its own card
  // `card` ({ x, w }) at `own` px down the wall, as laid out, and ghosts at
  // `ghosts`; and runs the strips of each that are near the roller.
  place(entry, card, own, ghosts, scroll) {
    const list = this.copies.get(entry) ?? this.copies.set(entry, [{ box: entry.item, name: this.name() }]).get(entry);
    list[0].top = own;
    this.ready(list[0], entry, card, scroll);
    ghosts.forEach((top, index) => {
      const copy = list[index + 1] ??= this.ghost(entry);
      if (copy.top !== top) copy.box.style.top = `${copy.top = top}px`;
      if (copy.left !== card.x) Object.assign(copy.box.style, { left: `${copy.left = card.x}px`, width: `${card.w}px` });
      if (copy.box.hidden) copy.box.hidden = false;
      copy.parked = false;
      this.ready(copy, entry, card, scroll);
    });
    list.slice(ghosts.length + 1).forEach(copy => this.park(copy));
  }

  ready(copy, entry, card, scroll) {
    if (!this.rolling) return;
    if (!copy.strips) this.strip(copy, entry, card);
    const { strip, zones } = this.rolling;
    const near = y => zones.some(([from, to]) => y < to && y + strip > from);
    copy.strips.forEach((element, index) => {
      const hidden = !near(copy.top + index * strip - scroll);
      if (element.hidden !== hidden) element.hidden = hidden;
    });
  }

  park(copy) {
    if (copy.ghost && !copy.box.hidden) copy.box.hidden = true;
    copy.strips?.forEach(element => { if (!element.hidden) element.hidden = true; });
    copy.parked = true;
  }

  // An inert likeness of the card, on the sheet.
  ghost(entry) {
    const box = entry.item.cloneNode(true);
    box.classList.add('works-ghost');
    box.classList.remove('is-active');
    box.inert = true;
    box.setAttribute('aria-hidden', 'true');
    for (const node of box.querySelectorAll('canvas, .works-seal')) node.remove();
    box.querySelector('.works-link')?.style.removeProperty('opacity');
    const frame = box.querySelector('.works-frame');
    if (frame) frame.style.transform = '';
    this.wall.append(box);
    return { box, ghost: true, name: this.name(), images: [...box.querySelectorAll('img')] };
  }

  name() {
    if (this.spare.length) return this.spare.pop();
    const name = `--works-copy-${this.names.length}`;
    this.names.push(name);
    this.root.style.setProperty('timeline-scope', this.names.join(', '));
    return name;
  }

  // The copy's strips, each a window on a likeness of the card, following
  // the copy's place in the scroll.
  strip(copy, entry, card) {
    const { strip, count, span, inset } = this.rolling;
    copy.box.style.setProperty('view-timeline', `${copy.name} block`);
    copy.box.style.setProperty('view-timeline-inset', inset);
    const face = entry.link.cloneNode(true);
    face.removeAttribute('href');
    face.removeAttribute('tabindex');
    face.removeAttribute('style');
    face.className = 'sheet-roller-face';
    for (const node of face.querySelectorAll('canvas, .works-seal')) node.remove();
    const frame = face.querySelector('.works-frame');
    if (frame) frame.style.transform = '';
    copy.strips = [];
    copy.faces = [];
    for (let index = 0; index < count; index++) {
      const el = Object.assign(document.createElement('div'), { className: 'sheet-roller-strip' });
      Object.assign(el.style, { left: `${card.x}px`, width: `${card.w}px`, height: `${strip + ROLLER.overlap}px` });
      el.style.animation = 'sheet-roll linear both';
      el.style.setProperty('animation-timeline', copy.name);
      el.style.setProperty('animation-range', `cover ${index * strip}px cover ${index * strip + span}px`);
      const piece = index ? face.cloneNode(true) : face;
      Object.assign(piece.style, { top: `${-index * strip}px`, width: `${card.w}px` });
      el.append(piece);
      el.hidden = true;
      copy.strips.push(el);
      copy.faces.push(...piece.querySelectorAll('img'));
    }
    this.layer.append(...copy.strips);
  }

  unstrip(copy) {
    copy.strips?.forEach(strip => strip.remove());
    copy.strips = copy.faces = null;
    copy.box.style.removeProperty('view-timeline');
    copy.box.style.removeProperty('view-timeline-inset');
  }

  // The card's photo changed: its likenesses take it too.
  refresh(entry) {
    const src = entry.image.getAttribute('src');
    for (const copy of this.copies.get(entry) ?? []) {
      for (const image of [...(copy.images ?? []), ...(copy.faces ?? [])]) if (image.getAttribute('src') !== src) image.setAttribute('src', src);
    }
  }

  // Kept out of sight while the cards move after a relayout, then faded in.
  hold() {
    this.layer.getAnimations().forEach(animation => animation.cancel());
    this.layer.classList.add('is-held');
  }

  release({ fade = true } = {}) {
    if (!this.layer.classList.contains('is-held')) return;
    this.layer.classList.remove('is-held');
    if (fade) this.layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ROLLER.fade, easing: 'ease' });
  }
}
