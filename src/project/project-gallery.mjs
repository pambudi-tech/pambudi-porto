import { STAMP, createPostageStamp, drawPostageStamp, stampOutline } from '../works/postage-stamp.mjs';
import { cornerPitch } from '../stitch/corners.mjs';
import { placement } from '../works/layout.mjs';
import { clamp } from '../shared/math.mjs';
import { mountCloseup } from './project-closeup.mjs';
import { ditherColor } from '../works/dither.mjs';

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
  fog: 4,        // stamps fade out over the last spacing before this many ahead
  blur: 4,       // px of blur for each spacing a stamp is behind the camera
  blurMost: 10,  // px, the most blur any stamp gets
  softest: 2.5,  // spacings behind by which a stamp is at its softest
  dim: .35,      // how dark a stamp is at its softest, as a share of black
  tilt: 12,      // degrees a stamp tips, edge to edge, under the pointer
  scatter: .07,  // turns either way each stamp may stray from its third
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
// Each goes out of focus as it nears, to `blur` px by the time it is gone:
// the nearer it flies, the more.
const LAYERS = [
  { selector: '.project-intro, .project-facts, .project-overview', z: 900, fade: .35, blur: 14 },
  { selector: '.cover-frame', z: 650, fade: .55, blur: 10 },
  { selector: '.hero-postage-stamp, .cover-figure .project-image, .cover-protected', z: 420, fade: .75, blur: 7 },
];

const ease = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOut = t => 1 - (1 - t) ** 3;

// Where a stamp shows on screen, seen at `scale` (1 at the camera, less
// deeper in), from the middle of the screen: round the middle of the room
// between the dots and the seal, each a third of a turn on from the last,
// give or take its own scatter, so the two behind the one in front fall
// either side of it, along whichever way the screen has room: across a wide
// one, up and down a tall one. The further back, and so the smaller, the further out
// it may go, so they show around the one in front rather than behind it. A
// stamp at the camera always fits on screen.
export function galleryPlacement(index, { width, height, w, h, scale = 1, top = DEPTH.top, bottom = DEPTH.bottom, side = DEPTH.side }) {
  const { lift, shift } = placement(index);
  const roomX = Math.max(0, width / 2 - side - w * scale / 2);
  const roomY = Math.max(0, (height - top - bottom - h * scale) / 2);
  // The first stamp in the middle of the way with room, the next two either side.
  const wide = width / 2 - side - w / 2 >= (height - top - bottom - h) / 2;
  const angle = (wide ? Math.PI / 2 : 0) + (index / 3 + (shift - .5) * DEPTH.scatter) * 2 * Math.PI;
  const reach = .72 + .28 * lift;
  const middle = top + (height - top - bottom) / 2 - height / 2;
  return { x: Math.cos(angle) * reach * roomX, y: middle + Math.sin(angle) * reach * roomY };
}

// A stamp's offset from the camera's axis at depth `z`, as translate3d takes
// it: where it should show, undone by the perspective that draws it in.
export function galleryOffset(index, z, room) {
  const scale = z < 0 ? DEPTH.perspective / (DEPTH.perspective - z) : 1;
  const { x, y } = galleryPlacement(index, { ...room, scale });
  return { x: x / scale, y: y / scale };
}

// How much of a stamp shows at a depth relative to the camera: whole, but
// for the last spacing before the fog, where it fades in, and as it passes.
export const depthOpacity = (z, spacing = DEPTH.spacing) =>
  clamp(z > 0 ? 1 - z / DEPTH.pass : DEPTH.fog + z / spacing, 0, 1);

// How far a stamp has gone from sharp, in px of the blur it once was:
// sharp at the camera, more the further behind. It is drawn as the site's
// dither (dotsCopy), dotted copies of the photo made once and faded in: fine
// dots by one spacing back, coarser by `softest`. Not a filter, whose cost on
// a large photo, redrawn every frame, would stall the flight.
export const depthBlur = (z, spacing = DEPTH.spacing) =>
  z < 0 ? Math.min(DEPTH.blurMost, -z / spacing * DEPTH.blur) : 0;

// The depth goes on for ever: past the last stamp, the first comes round
// again, and on. A place along it is a `spot`, 0 where the gallery opens;
// spot k shows stamp k mod count. Back from spot 0 is the way out.
export const gallerySpot = (camera, spacing = DEPTH.spacing) => Math.max(0, Math.round(camera / spacing));

// The stamp nearest the camera.
export const galleryCurrent = (camera, count, spacing = DEPTH.spacing) =>
  count ? gallerySpot(camera, spacing) % count : 0;

// Where stamp `index` is met next, for a camera at `camera`: the spot it
// shows at, and its depth there, never further behind the camera than it has
// just passed (`pass`), nor so far ahead that it would come round again first.
export function galleryMeeting(index, camera, count, spacing = DEPTH.spacing) {
  const first = Math.max(0, Math.ceil((camera - DEPTH.pass) / spacing));
  const spot = first + (((index - first) % count) + count) % count;
  return { spot, z: camera - spot * spacing };
}

// The spot nearest `near` that shows stamp `index`.
export function gallerySpotOf(index, near, count) {
  const before = near - (((near - index) % count) + count) % count;
  return before >= 0 && near - before <= before + count - near ? before : before + count;
}

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

// A stamp's photo in the site's dither, as a protected project's cover shows
// before its PIN (tools/locked-preview.py): kept only as fine as a small copy
// (`sample` px wide), then dots `cell` px wide in its own colours, each at one
// of `levels` brightness steps (ditherColor). Made once for the stamp's size,
// it lies in the photo's window; the paper and its edge stay sharp. The
// photo fills the stamp as on the page, cropped to it from its middle.
export const DEPTH_DITHER = Object.freeze([
  { cell: 3, levels: 5, sample: 280 },
  { cell: 5, levels: 4, sample: 140 },
]);

export function dotsCopy(canvas, image, { w, h, cell, levels, sample }) {
  const columns = Math.max(1, Math.round(w / cell)), rows = Math.max(1, Math.round(h / cell));
  const draw = (width, height, source, crop) => {
    const target = Object.assign(document.createElement('canvas'), { width, height });
    const context = target.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, ...crop, 0, 0, width, height);
    return { target, context };
  };
  const cover = Math.min(image.naturalWidth / w, image.naturalHeight / h);
  const sw = w * cover, sh = h * cover;
  const { target: tiny } = draw(sample, Math.round(sample * h / w), image, [(image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh]);
  const { context } = draw(columns, rows, tiny, [0, 0, tiny.width, tiny.height]);
  // Throws for a photo another site has not let us read; the caller then
  // softens it instead.
  const pixels = context.getImageData(0, 0, columns, rows);
  const data = pixels.data;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 4;
      const [r, g, b] = ditherColor([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255], x, y, levels);
      data[i] = r * 255; data[i + 1] = g * 255; data[i + 2] = b * 255; data[i + 3] = 255;
    }
  }
  Object.assign(canvas, { width: columns, height: rows });
  canvas.getContext('2d').putImageData(pixels, 0, 0);
  canvas.classList.remove('is-soft');
}

// Where a photo cannot be read for its dots, it is only softened: drawn
// small and enlarged again, smoothly.
export function softCopy(canvas, image, { w, h, cell }) {
  const width = Math.max(8, Math.round(w / cell / 3)), height = Math.round(width * h / w);
  const make = (cw, ch, source, ...crop) => {
    const target = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
    const context = target.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, ...crop, 0, 0, cw, ch);
    return target;
  };
  const cover = Math.min(image.naturalWidth / w, image.naturalHeight / h);
  const sw = w * cover, sh = h * cover;
  const small = make(width, height, image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh);
  const soft = make(width * 4, height * 4, small, 0, 0, width, height);
  Object.assign(canvas, { width: soft.width, height: soft.height });
  canvas.getContext('2d').drawImage(soft, 0, 0);
  canvas.classList.add('is-soft');
}

// `after`: what the page waits on, its cover; the photos are fetched once it
// is in, so the two never share the line.
export function mountProjectGallery({ images, title, seal, motionPreference, after }) {
  const root = Object.assign(document.createElement('div'), { className: 'project-depth', id: 'project-depth' });
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', `${title} gallery`);
  root.inert = true;
  // Fetched after the cover, or at once should the gallery open first.
  let fetchPhotos;
  const fetching = new Promise(resolve => { fetchPhotos = resolve; });
  Promise.resolve(after).catch(() => {}).then(fetchPhotos);
  const stamps = images.map((item, index) => {
    const element = Object.assign(document.createElement('figure'), { className: 'project-depth-stamp' });
    const paper = createPostageStamp(`project-depth-paper-${index}`, 'project-depth-paper');
    const media = Object.assign(document.createElement('div'), { className: 'project-depth-photo' });
    // Asked for so its pixels may be read for its dots: Unsplash allows it,
    // and the site's own private photos are its own.
    const photo = Object.assign(new Image(item.width, item.height), { crossOrigin: 'anonymous', alt: item.alt, decoding: 'async' });
    // Its soft copy, faded in the further back it is; and the photo decoded
    // as it arrives, while the page is read, so it is ready before the
    // gallery opens.
    const soft = DEPTH_DITHER.map(() => {
      const copy = Object.assign(document.createElement('canvas'), { className: 'project-depth-dither' });
      copy.setAttribute('aria-hidden', 'true');
      return copy;
    });
    const decoded = fetching.then(() => { photo.src = item.src; return photo.decode(); }).catch(() => {});
    // And dimmed, as it is dotted, the further back it is.
    const dim = Object.assign(document.createElement('div'), { className: 'project-depth-dim' });
    media.append(photo, ...soft, dim);
    // A sheen over the photo, lit where the pointer tips the stamp.
    const sheen = Object.assign(document.createElement('div'), { className: 'project-depth-sheen' });
    media.append(sheen);
    // The stamp tilts within its place, which the depth sets each frame.
    const tilt = Object.assign(document.createElement('div'), { className: 'project-depth-tilt' });
    tilt.append(paper, media);
    element.append(tilt);
    // Under a pointer it tips toward it, as a stamp held up to the light: the
    // one in front in the depth, and every one on the sheet.
    const lean = event => {
      const live = open && !busy && !closeup.isOpen() && (view === 'sheet' || index === current);
      if (!live || event.pointerType === 'touch' || reduced()) { level(); return; }
      const box = element.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - .5, y = (event.clientY - box.top) / box.height - .5;
      tilt.style.setProperty('--tilt-x', `${(-y * DEPTH.tilt).toFixed(2)}deg`);
      tilt.style.setProperty('--tilt-y', `${(x * DEPTH.tilt).toFixed(2)}deg`);
      tilt.style.setProperty('--sheen-x', `${((x + .5) * 100).toFixed(1)}%`);
      tilt.style.setProperty('--sheen-y', `${((y + .5) * 100).toFixed(1)}%`);
      tilt.classList.add('is-tilted');
    };
    const level = () => {
      tilt.style.removeProperty('--tilt-x');
      tilt.style.removeProperty('--tilt-y');
      tilt.classList.remove('is-tilted');
    };
    element.addEventListener('pointermove', lean);
    element.addEventListener('pointerleave', level);
    element.addEventListener('click', level);
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', `Image ${index + 1} of ${images.length}: ${item.alt}`);
    element.tabIndex = -1;
    // The stamp in front, or any on the sheet, comes up close; one waiting
    // behind in the depth brings the camera to it.
    const choose = () => {
      if (!open || busy || closeup.isOpen()) return;
      if (view === 'sheet' || index === current) { jumpTo(index); closeup.open(index); } else flyToSpot(stamps[index].spot);
    };
    element.addEventListener('click', choose);
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      choose();
    });
    root.append(element);
    return { element, paper, media, photo, soft, dim, decoded, spot: index, sheetX: 0, sheetY: 0, sheetScale: 1 };
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
  // Measured from the first button, not the switch's edge, so its padding,
  // none while it is folded shut, never shifts the pill.
  const placePill = () => {
    const chosen = viewButtons.find(button => button.dataset.view === view);
    views.style.setProperty('--pill-left', `${chosen.offsetLeft - viewButtons[0].offsetLeft}px`);
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
  // Where the camera was as the gallery began to close from the sheet: the
  // sheet then draws back as the camera does, flat, without gathering into
  // the depth first.
  let leavingFrom = null;
  // The screen and the stamps' size, for their places in the depth.
  let stage = null;

  // The stamps' size for this screen.
  function measure() {
    const width = innerWidth, height = innerHeight, narrow = width <= 760;
    const room = height - DEPTH.top - DEPTH.bottom;
    const w = Math.round(Math.max(160, Math.min(width * (narrow ? .78 : .46), room * .92 * 4 / 3)));
    return { width, height, narrow, w, h: Math.round(w * 3 / 4), perf: STAMP.perf * cornerPitch(width) };
  }

  // A stamp's dotted copies, made for its size once its photo is ready, and
  // again only if the size changes: the drawing is kept out of the flight.
  function prepareSoft(stamp, { w, h, perf }) {
    const key = `${w}x${h}@${perf}`;
    if (stamp.softKey === key) return;
    stamp.softKey = key;
    stamp.decoded.then(() => {
      if (stamp.softKey !== key || !stamp.photo.naturalWidth) return;
      stamp.soft.forEach((copy, k) => {
        try {
          dotsCopy(copy, stamp.photo, { w, h, ...DEPTH_DITHER[k] });
        } catch {
          softCopy(copy, stamp.photo, { w, h, ...DEPTH_DITHER[k] });
        }
      });
    });
  }

  function layout() {
    const { width, height, narrow, w, h, perf } = measure();
    const outline = stampOutline(w, h, perf);
    stamps.forEach(stamp => {
      Object.assign(stamp.element.style, { width: `${w}px`, height: `${h}px`, marginLeft: `${-w / 2}px`, marginTop: `${-h / 2}px` });
      drawPostageStamp(stamp.paper, w, h, perf, { whole: true });
      stamp.media.style.clipPath = `path('${outline}')`;
      prepareSoft(stamp, { w, h, perf });
    });
    stage = { width, height, w, h };
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
      const { spot: at, z } = galleryMeeting(index, camera, stamps.length);
      const from = Math.min(z, DEPTH.pass);
      stamp.spot = at;
      const t = sheetProgress(sheet, index, stamps.length);
      // Placed by its spot, so each time round it sits somewhere new.
      const spot = stage ? galleryOffset(at, from, stage) : { x: 0, y: 0 };
      const x = lerp(spot.x, stamp.sheetX, t), y = lerp(spot.y, stamp.sheetY, t);
      const back = leavingFrom === null ? 0 : camera - leavingFrom;
      const depth = lerp(from, 0, t) + t * back, scale = lerp(1, stamp.sheetScale, t);
      const opacity = lerp(depthOpacity(z), 1, t) * appear;
      // Out of focus by depth, in spacings behind: a little by one, much by `softest`.
      const behind = (lerp(depthBlur(z), 0, t) + t * depthBlur(back)) / DEPTH.blur;
      // The dotted photo comes over the sharp one, which stays whole beneath
      // it, so the stamp never thins as the dots come and go.
      stamp.soft[0].style.opacity = clamp(behind).toFixed(3);
      stamp.soft[1].style.opacity = clamp((behind - 1) / (DEPTH.softest - 1)).toFixed(3);
      stamp.dim.style.opacity = (clamp(behind / DEPTH.softest) * DEPTH.dim).toFixed(3);
      stamp.element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${depth.toFixed(1)}px) scale(${scale.toFixed(4)})`;
      stamp.element.style.opacity = opacity.toFixed(3);
      stamp.element.style.visibility = opacity > 0 ? 'visible' : 'hidden';
      // The nearer over the further, whichever time round each is.
      stamp.element.style.zIndex = String(5000 + Math.round(depth));
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

  // Straight to a stamp, unseen: under the close-up, or on the sheet. It is
  // met at the spot nearest the one the camera is headed for.
  function jumpTo(index) {
    cancelAnimationFrame(frame);
    frame = null;
    camera = target = gallerySpotOf(index, gallerySpot(target), stamps.length) * DEPTH.spacing;
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
  function flyToSpot(spot) {
    const from = camera, to = Math.max(0, spot) * DEPTH.spacing;
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
  // A stamp by its number, met at its spot nearest the camera's way.
  const flyTo = index => flyToSpot(gallerySpotOf(index, gallerySpot(target), stamps.length));
  // However hard the scroll, one spot on from where the camera is headed.
  const flyOn = direction => flyToSpot(gallerySpot(target) + direction);

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
  // middle of the screen and blurring as it nears the camera; closing, they
  // come back into focus as they settle.
  function partHero(direction) {
    const duration = reduced() ? 0 : DEPTH.duration;
    const at = z => `perspective(${DEPTH.perspective}px) translateZ(${z}px)`;
    if (direction === 'normal') {
      layers = LAYERS.flatMap(({ selector, z, fade, blur }) => [...document.querySelectorAll(selector)].map(element => {
        const box = element.getBoundingClientRect();
        element.style.transformOrigin = `${innerWidth / 2 - box.left}px ${innerHeight / 2 - box.top}px`;
        // Its own filter, the stamp paper's shadow, is kept under the blur.
        const own = getComputedStyle(element).filter, base = own === 'none' ? '' : `${own} `;
        const focus = amount => `${base}blur(${amount}px)`;
        return element.animate([
          { transform: at(0), opacity: 1, filter: focus(0) },
          { opacity: 0, filter: focus(blur), offset: fade },
          { transform: at(z), opacity: 0, filter: focus(blur) },
        ], { duration, easing: 'cubic-bezier(.55, 0, .45, 1)', fill: 'both' });
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
        fetchPhotos();
        // The page holds still from here until the gallery has closed: the
        // flying layers grow far past it, and the wheel belongs to the depth.
        document.documentElement.classList.add('gallery-active');
        layout();
        settle(true);
        target = 0;
        await Promise.all([partHero('normal'), travel(-DEPTH.spacing * DEPTH.approach, 0, 0, 1)]);
      } else {
        settle(false);
        // From the sheet, the sheet itself draws back and fades as the hero
        // returns, as the depth would, without becoming the depth first.
        if (sheet > 0) {
          cancelAnimationFrame(morph);
          morph = null;
          leavingFrom = camera;
        }
        await Promise.all([partHero('reverse'), travel(camera, camera - DEPTH.spacing * DEPTH.approach, 1, 0)]);
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
    leavingFrom = null;
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
    const next = gallerySpot(target) + step;
    // Up from where the gallery opened goes back to the cover.
    if (next < 0) { toggle(); return; }
    flyToSpot(next);
  });
  addEventListener('resize', () => { if (open) layout(); });
  seal.addEventListener('click', toggle);
  render();
  // The dotted copies are made while the page is read, a stamp at a time
  // when the page is idle, so opening the gallery has nothing left to draw.
  const idle = window.requestIdleCallback ?? (task => setTimeout(task, 200));
  const sizes = measure();
  stamps.forEach(stamp => stamp.decoded.then(() => idle(() => { if (!open) prepareSoft(stamp, sizes); })));
  return { reset };
}
