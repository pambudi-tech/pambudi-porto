import { STAMP, createPostageStamp, drawPostageStamp, stampOutline } from '../works/postage-stamp.mjs';
import { cornerPitch } from '../stitch/corners.mjs';
import { placement } from '../works/layout.mjs';
import { clamp } from '../shared/math.mjs';
import { mountCloseup } from './project-closeup.mjs';

// The project's gallery, entered in depth. The "gallery" seal pushes in
// through the hero, whose layers part at their own speeds: the words rush
// past first, then the stitched frame, and the photo last. Behind it the
// gallery's stamps wait one behind another, scattered like the works row;
// the wheel, a swipe or the arrow keys travel forward and back through them.
// A switch lays them out flat instead, as one sheet of stamps, and a click on
// a stamp brings it up close.
export const DEPTH = Object.freeze({
  perspective: 1000, spacing: 640, duration: 1000,
  step: 800,     // ms a scroll's flight to the next stamp takes
  fog: 3,        // stamps fade out this many spacings ahead
  pass: 360,     // and are gone this far past the camera
  approach: 1.5, // spacings the stamps travel in from as it opens
  intent: 60,    // px of wheel or swipe past an end that opens or closes it
  pause: 120,    // ms of quiet after which the wheel is a new scroll
  lock: 350,     // ms after one scroll moves before a quicker one counts as new
  window: 6,     // wheel deltas averaged to tell a quicker scroll
  top: 96, bottom: 150, side: 32,
});

// The sheet: the stamps laid out flat in rows, each dealt a little after the
// last as they move between it and the depth.
export const SHEET = Object.freeze({
  duration: 900, // ms the stamps take to move between the depth and the sheet
  stagger: 70,   // ms each stamp sets off after the one before
  fuller: .85,   // of the widest stamp, the least a fuller sheet may give
  top: 84, bottom: 116, side: 32, gap: 28,
});

// The hero's layers, each sent this far toward the camera, gone by `fade`.
const LAYERS = [
  { selector: '.project-intro, .project-facts, .project-overview', z: 900, fade: .35 },
  { selector: '.cover-frame', z: 650, fade: .55 },
  { selector: '.hero-postage-stamp, .cover-figure .project-image, .cover-protected', z: 420, fade: .75 },
];

const ease = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOut = t => 1 - (1 - t) ** 3;

// Where a stamp sits on screen, from the middle of the room between the dots
// and the seal: sides alternate, each set in by its own scatter, the same on
// every visit. A stamp at the camera always fits on screen.
export function galleryPlacement(index, { width, height, w, h, top = DEPTH.top, bottom = DEPTH.bottom, side = DEPTH.side }) {
  const { lift, shift } = placement(index);
  const roomX = Math.max(0, width / 2 - side - w / 2);
  const roomY = Math.max(0, (height - top - bottom - h) / 2);
  const middle = top + (height - top - bottom) / 2 - height / 2;
  return { x: (index % 2 ? 1 : -1) * roomX * (.35 + .5 * shift), y: middle + (lift * 2 - 1) * roomY };
}

// How much of a stamp shows at a depth relative to the camera: fading in
// from the fog ahead, and out as it passes.
export const depthOpacity = (z, spacing = DEPTH.spacing) =>
  clamp(z > 0 ? 1 - z / DEPTH.pass : 1 + z / (spacing * DEPTH.fog), 0, 1);

// The stamp nearest the camera.
export const galleryCurrent = (camera, count, spacing = DEPTH.spacing) =>
  clamp(Math.round(camera / spacing), 0, Math.max(0, count - 1));

// The sheet's stamps, nearly as large as the screen allows: of the column
// counts that give a stamp within `fuller` of the widest, the one with the
// fewest rows, then the fewest empty cells, since full rows read as a sheet.
// Rows are centred, a short last row too. Each
// cell's centre is given from the middle of the screen, as a stamp's place
// in the depth is.
export function sheetLayout(count, { width, height, top = SHEET.top, bottom = SHEET.bottom, side = SHEET.side, gap = SHEET.gap }) {
  const roomWidth = width - side * 2, roomHeight = height - top - bottom;
  const widthAt = columns => Math.min((roomWidth - gap * (columns - 1)) / columns, (roomHeight - gap * (Math.ceil(count / columns) - 1)) / Math.ceil(count / columns) * 4 / 3);
  const widest = Math.max(...Array.from({ length: count }, (_, i) => widthAt(i + 1)));
  const rank = c => Math.ceil(count / c) * count + (Math.ceil(count / c) * c - count);
  let columns = 1;
  for (let c = 2; c <= count; c++) if (widthAt(c) >= widest * SHEET.fuller && rank(c) < rank(columns)) columns = c;
  const w = Math.max(40, widthAt(columns)), h = w * 3 / 4, rows = Math.ceil(count / columns);
  const middle = top + roomHeight / 2 - height / 2;
  const cells = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns), inRow = Math.min(columns, count - row * columns);
    return {
      x: ((index % columns) - (inRow - 1) / 2) * (w + gap),
      y: middle + (row - (rows - 1) / 2) * (h + gap),
    };
  });
  return { columns, width: w, height: h, cells };
}

// How far one stamp is on its way to the sheet, 0–1, when the whole move is
// `progress` of the way: each sets off `stagger` after the one before.
export function sheetProgress(progress, index, count, { duration = SHEET.duration, stagger = SHEET.stagger } = {}) {
  const gap = count > 1 ? Math.min(stagger, duration / 2 / (count - 1)) : 0;
  return ease(clamp((progress * duration - index * gap) / (duration - (count - 1) * gap)));
}

// Tells each new scroll of the wheel from the momentum trailing the last one.
// A trackpad keeps sending a scroll's momentum long after the fingers lift,
// and a new scroll arrives in the same stream. Momentum only ever fades, so a
// new scroll is one after a pause, one the other way, or, once the last has
// had `lock` to run its course and faded to under a third of its speed, a
// clear rise again (judged over several deltas, never one, since a
// finger's speed wobbles).
// Fed each delta and its time, it answers 1 or -1 once a scroll has gone
// `intent`, else 0, and only once per scroll; `began` says the delta just fed
// began a new one, and `spend` lets go of the scroll under way.
export function wheelScrolls() {
  let last = -Infinity, spent = -Infinity, ready = true, gathered = 0, direction = 0, recent = [];
  let fastest = 0, slowest = Infinity;
  const restart = () => { fastest = 0; slowest = Infinity; };
  const mean = sizes => sizes.reduce((sum, size) => sum + size, 0) / Math.max(1, sizes.length);
  const scrolls = {
    began: false,
    spend(time) {
      ready = false;
      gathered = 0;
      spent = last = Math.max(last, time);
      restart();
    },
    feed(delta, time) {
      const size = Math.abs(delta), sign = Math.sign(delta);
      const paused = time - last > DEPTH.pause;
      if (paused) recent = [];
      recent = [...recent.slice(-(DEPTH.window * 3 - 1)), size];
      const lately = mean(recent.slice(-DEPTH.window)), before = mean(recent.slice(0, -DEPTH.window));
      fastest = Math.max(fastest, lately);
      const faded = slowest < fastest / 3;
      const quickened = faded && recent.length >= DEPTH.window * 2 && lately >= 6 && lately > slowest * 2.5 && lately > before * 1.8 && time - spent > DEPTH.lock;
      slowest = Math.min(slowest, lately);
      const turned = sign && direction && sign !== direction && size >= 4;
      scrolls.began = paused || (!ready && (quickened || turned));
      if (scrolls.began) { ready = true; gathered = 0; direction = sign || direction; restart(); }
      last = time;
      if (!ready || !sign) return 0;
      if (Math.sign(gathered) !== sign) gathered = 0;
      gathered += delta;
      if (Math.abs(gathered) < DEPTH.intent) return 0;
      ready = false;
      gathered = 0;
      spent = time;
      direction = sign;
      restart();
      return sign;
    },
  };
  return scrolls;
}

export function mountProjectGallery({ images, title, seal, motionPreference }) {
  const root = Object.assign(document.createElement('div'), { className: 'project-depth', id: 'project-depth' });
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', `${title} gallery`);
  root.inert = true;
  const stamps = images.map((item, index) => {
    const element = Object.assign(document.createElement('figure'), { className: 'project-depth-stamp' });
    const paper = createPostageStamp(`project-depth-paper-${index}`, 'project-depth-paper');
    const media = Object.assign(document.createElement('div'), { className: 'project-depth-photo' });
    media.append(Object.assign(new Image(item.width, item.height), { src: item.src, alt: item.alt, decoding: 'async' }));
    element.append(paper, media);
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', `Image ${index + 1} of ${images.length}: ${item.alt}`);
    element.tabIndex = -1;
    // The stamp in front, or any on the sheet, comes up close; one waiting
    // behind in the depth brings the camera to it.
    const choose = () => {
      if (!open || busy || closeup.isOpen()) return;
      if (view === 'sheet' || index === current) { jumpTo(index); closeup.open(index); } else flyTo(index);
    };
    element.addEventListener('click', choose);
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      choose();
    });
    root.append(element);
    return { element, paper, media, x: 0, y: 0, sheetX: 0, sheetY: 0, sheetScale: 1 };
  });
  const dots = Object.assign(document.createElement('nav'), { className: 'project-depth-dots' });
  dots.setAttribute('aria-label', 'Gallery');
  dots.append(...images.map((item, index) => {
    const dot = Object.assign(document.createElement('button'), { type: 'button', className: 'project-depth-dot' });
    dot.setAttribute('aria-label', `Image ${index + 1} of ${images.length}`);
    dot.addEventListener('click', () => flyTo(index));
    return dot;
  }));
  document.body.append(root, dots);

  // The switch between the depth and the sheet, beside the project's name
  // while the gallery is open; its ink pill slides to the view chosen.
  const views = Object.assign(document.createElement('div'), { className: 'project-views' });
  views.setAttribute('role', 'group');
  views.setAttribute('aria-label', 'Gallery view');
  views.innerHTML = '<span class="project-views-pill" aria-hidden="true"></span>'
    + '<button type="button" data-view="depth" aria-pressed="true">depth</button>'
    + '<button type="button" data-view="sheet" aria-pressed="false">sheet</button>';
  (document.querySelector('.project-nav') ?? document.body).append(views);
  const viewButtons = [...views.querySelectorAll('button')];
  viewButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  const placePill = () => {
    const chosen = viewButtons.find(button => button.dataset.view === view);
    views.style.setProperty('--pill-left', `${chosen.offsetLeft}px`);
    views.style.setProperty('--pill-width', `${chosen.offsetWidth}px`);
  };

  const closeup = mountCloseup({
    images, motionPreference,
    sourceOf: index => stamps[index].element,
    onIndex: index => jumpTo(index),
    // Its wheel never carries on into the gallery's.
    onClose: () => scrolls.spend(performance.now()),
  });

  const label = seal.querySelector('.works-seal-label');
  seal.setAttribute('aria-controls', root.id);
  seal.setAttribute('aria-expanded', 'false');
  const reduced = () => motionPreference.matches;
  let open = false, busy = false, camera = 0, target = 0, appear = 0, current = -1, frame = null;
  let layers = [];
  // The view, and how far the stamps are on their way to the sheet, 0–1.
  let view = 'depth', sheet = 0, morph = null;

  function layout() {
    const width = innerWidth, height = innerHeight, narrow = width <= 760;
    const room = height - DEPTH.top - DEPTH.bottom;
    const w = Math.round(Math.max(160, Math.min(width * (narrow ? .78 : .46), room * .92 * 4 / 3)));
    const h = Math.round(w * 3 / 4);
    const perf = STAMP.perf * cornerPitch(width);
    const outline = stampOutline(w, h, perf);
    stamps.forEach((stamp, index) => {
      Object.assign(stamp.element.style, { width: `${w}px`, height: `${h}px`, marginLeft: `${-w / 2}px`, marginTop: `${-h / 2}px`, zIndex: String(stamps.length - index) });
      drawPostageStamp(stamp.paper, w, h, perf, { whole: true });
      stamp.media.style.clipPath = `path('${outline}')`;
      Object.assign(stamp, galleryPlacement(index, { width, height, w, h }));
    });
    const grid = sheetLayout(stamps.length, narrow ? { width, height, side: 16, gap: 16 } : { width, height });
    stamps.forEach((stamp, index) => {
      Object.assign(stamp, { sheetX: grid.cells[index].x, sheetY: grid.cells[index].y, sheetScale: grid.width / w });
    });
    placePill();
    render();
  }

  // Each stamp is drawn where it is between its place in the depth and its
  // cell on the sheet. One passed by the camera sets off from just behind it,
  // never through it.
  function render() {
    const lerp = (a, b, t) => a + (b - a) * t;
    stamps.forEach((stamp, index) => {
      const z = camera - index * DEPTH.spacing;
      const t = sheetProgress(sheet, index, stamps.length);
      const x = lerp(stamp.x, stamp.sheetX, t), y = lerp(stamp.y, stamp.sheetY, t);
      const depth = lerp(Math.min(z, DEPTH.pass), 0, t), scale = lerp(1, stamp.sheetScale, t);
      const opacity = lerp(depthOpacity(z), 1, t) * appear;
      stamp.element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${depth.toFixed(1)}px) scale(${scale.toFixed(4)})`;
      stamp.element.style.opacity = opacity.toFixed(3);
      stamp.element.style.visibility = opacity > 0 ? 'visible' : 'hidden';
    });
    const now = galleryCurrent(camera, stamps.length);
    if (now !== current) {
      current = now;
      [...dots.children].forEach((dot, index) => index === now ? dot.setAttribute('aria-current', 'true') : dot.removeAttribute('aria-current'));
    }
    stamps.forEach((stamp, index) => {
      stamp.element.classList.toggle('is-current', index === now);
      stamp.element.tabIndex = open && (view === 'sheet' || index === now) ? 0 : -1;
    });
  }

  // Straight to a stamp, unseen: under the close-up, or on the sheet.
  function jumpTo(index) {
    cancelAnimationFrame(frame);
    frame = null;
    camera = target = clamp(index, 0, stamps.length - 1) * DEPTH.spacing;
    render();
  }

  // The stamps move between the depth and the sheet, from wherever they are.
  function morphTo(to, length = SHEET.duration) {
    cancelAnimationFrame(morph);
    const from = sheet, duration = reduced() ? 0 : length * Math.abs(to - from);
    return new Promise(resolve => {
      const start = performance.now();
      const step = now => {
        const t = duration ? clamp((now - start) / duration, 0, 1) : 1;
        sheet = from + (to - from) * t;
        render();
        if (t < 1) morph = requestAnimationFrame(step);
        else { morph = null; resolve(); }
      };
      step(start);
    });
  }

  function setView(name) {
    if (name === view || !open || busy) return;
    view = name;
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
    document.body.classList.toggle('gallery-sheet', name === 'sheet');
    placePill();
    // A flight under way lands at once, so the stamps set off from rest.
    if (frame) jumpTo(galleryCurrent(target, stamps.length));
    morphTo(name === 'sheet' ? 1 : 0);
  }

  // The camera's flight to a stamp, as fixed as the one that opened the
  // gallery. Sent on again mid-flight, it carries on at speed rather than
  // starting from rest.
  function flyTo(index) {
    const from = camera, to = clamp(index, 0, stamps.length - 1) * DEPTH.spacing;
    const curve = frame ? easeOut : ease;
    cancelAnimationFrame(frame);
    target = to;
    if (reduced()) { frame = null; camera = to; render(); return; }
    const start = performance.now();
    frame = requestAnimationFrame(function step(now) {
      const t = clamp((now - start) / DEPTH.step, 0, 1);
      camera = from + (to - from) * curve(t);
      render();
      frame = t < 1 ? requestAnimationFrame(step) : null;
    });
  }
  // However hard the scroll, one stamp on from where the camera is headed.
  const flyOn = direction => flyTo(galleryCurrent(target, stamps.length) + direction);

  // The camera's flight in or out, with the stamps appearing alongside.
  function travel(from, to, appearFrom, appearTo, length = DEPTH.duration) {
    const duration = reduced() ? 0 : length;
    cancelAnimationFrame(frame);
    frame = null;
    return new Promise(resolve => {
      const start = performance.now();
      const step = now => {
        const t = duration ? clamp((now - start) / duration, 0, 1) : 1;
        camera = from + (to - from) * ease(t);
        appear = appearFrom + (appearTo - appearFrom) * clamp((t - .25) / .5, 0, 1);
        render();
        if (t < 1) frame = requestAnimationFrame(step);
        else { frame = null; resolve(); }
      };
      step(start);
    });
  }

  // The hero's layers part at their own speeds, each growing away from the
  // middle of the screen as it nears the camera.
  function partHero(direction) {
    const duration = reduced() ? 0 : DEPTH.duration;
    const at = z => `perspective(${DEPTH.perspective}px) translateZ(${z}px)`;
    if (direction === 'normal') {
      layers = LAYERS.flatMap(({ selector, z, fade }) => [...document.querySelectorAll(selector)].map(element => {
        const box = element.getBoundingClientRect();
        element.style.transformOrigin = `${innerWidth / 2 - box.left}px ${innerHeight / 2 - box.top}px`;
        return element.animate([{ transform: at(0), opacity: 1 }, { opacity: 0, offset: fade }, { transform: at(z), opacity: 0 }],
          { duration, easing: 'cubic-bezier(.55, 0, .45, 1)', fill: 'both' });
      }));
    } else layers.forEach(animation => animation.reverse());
    return Promise.all(layers.map(animation => animation.finished));
  }

  function settle(isOpen) {
    open = isOpen;
    root.inert = !isOpen;
    document.body.classList.toggle('gallery-open', isOpen);
    seal.setAttribute('aria-expanded', String(isOpen));
    label.textContent = isOpen ? 'back' : 'gallery';
    seal.setAttribute('aria-label', isOpen ? 'Back to the cover' : 'gallery');
  }

  async function toggle() {
    if (busy) return;
    busy = true;
    try {
      if (!open) {
        // The page holds still from here until the gallery has closed: the
        // flying layers grow far past it, and the wheel belongs to the depth.
        document.documentElement.classList.add('gallery-active');
        layout();
        settle(true);
        target = 0;
        await Promise.all([partHero('normal'), travel(-DEPTH.spacing * DEPTH.approach, 0, 0, 1)]);
      } else {
        settle(false);
        // From the sheet, the stamps fall back into the depth as it closes.
        await Promise.all([partHero('reverse'), travel(camera, camera - DEPTH.spacing * DEPTH.approach, 1, 0), morphTo(0, DEPTH.duration)]);
        reset();
      }
    } catch {
      // A reset cancelled the move midway; it has already closed the gallery.
    }
    busy = false;
    // The scroll that got here is spent, so its momentum never carries
    // straight back through; the next scroll counts at once.
    scrolls.spend(performance.now());
  }

  // Closed at once, the hero whole again.
  function reset() {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(morph);
    frame = morph = null;
    closeup.reset();
    sheet = 0;
    view = 'depth';
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === 'depth')));
    document.body.classList.remove('gallery-sheet');
    layers.forEach(animation => { animation.cancel(); animation.effect.target.style.transformOrigin = ''; });
    layers = [];
    camera = target = 0;
    appear = 0;
    busy = false;
    settle(false);
    document.documentElement.classList.remove('gallery-active');
    render();
  }

  // Scrolling on past the cover opens the gallery; scrolling back up past its
  // first stamp closes it. On a page taller than the screen, the cover's page
  // scrolls to its end first. A scroll that reaches the end stops there; only
  // one that starts at it goes through.
  let fromEnd = false;
  const scrolls = wheelScrolls();
  const arriving = () => document.body.classList.contains('project-arriving');
  const atPageEnd = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
  const atFirst = () => target <= 0 && camera < 1;
  addEventListener('wheel', event => {
    const now = performance.now();
    const raw = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    const delta = event.deltaMode === 1 ? raw * 40 : raw;
    // The close-up has the wheel to itself.
    if (closeup.isOpen()) return;
    const direction = scrolls.feed(delta, now);
    // In the gallery each scroll flies on one stamp, and up from the first
    // goes back to the cover. The sheet holds still.
    if (open) {
      event.preventDefault();
      if (!direction || busy || arriving() || view === 'sheet') return;
      if (direction < 0 && target <= 0) toggle();
      else flyOn(direction);
      return;
    }
    if (scrolls.began) fromEnd = atPageEnd();
    if (busy || arriving() || !(delta > 0 && fromEnd && atPageEnd())) return;
    event.preventDefault();
    if (direction > 0) toggle();
  }, { passive: false });

  let swipe = null, swipeFrom = null;
  let swipeFromEnd = false;
  addEventListener('touchstart', event => {
    swipe = swipeFrom = event.touches[0].clientY;
    swipeFromEnd = open ? atFirst() : atPageEnd();
  }, { passive: true });
  addEventListener('touchmove', event => {
    if (swipe === null || busy || arriving() || closeup.isOpen()) return;
    const y = event.touches[0].clientY;
    if (!open) {
      // A swipe up that starts at the end of the page opens it.
      if (swipeFromEnd && swipeFrom - y > DEPTH.intent) { swipe = null; toggle(); }
      return;
    }
    // A swipe down that starts at the first stamp closes it.
    if (swipeFromEnd && view === 'depth' && y - swipeFrom > DEPTH.intent) { swipe = null; toggle(); return; }
    if (view === 'sheet') return;
    // A swipe, too, flies on one stamp.
    if (Math.abs(swipeFrom - y) < DEPTH.intent) return;
    swipe = null;
    flyOn(Math.sign(swipeFrom - y));
  }, { passive: true });
  addEventListener('touchend', () => { swipe = swipeFrom = null; }, { passive: true });

  addEventListener('keydown', event => {
    if (busy || arriving() || closeup.isOpen()) return;
    const step = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[event.key];
    if (!open) {
      // Down past the end of the page opens it, as the wheel does.
      if ((event.key === 'ArrowDown' || event.key === 'PageDown') && atPageEnd()) { event.preventDefault(); toggle(); }
      return;
    }
    if (event.key === 'Escape') { toggle(); return; }
    if (!step || view === 'sheet') return;
    event.preventDefault();
    const next = galleryCurrent(target, stamps.length) + step;
    // Up from the first stamp goes back to the cover.
    if (next < 0) { toggle(); return; }
    flyTo(next);
  });
  addEventListener('resize', () => { if (open) layout(); });
  seal.addEventListener('click', toggle);
  render();
  return { reset };
}
