import { STAMP, createPostageStamp, drawPostageStamp, stampOutline } from './postage-stamp.mjs';
import { cornerPitch } from './corners.mjs';
import { placement } from './works.mjs';

// The project's gallery, entered in depth. The "gallery" seal pushes in
// through the hero, whose layers part at their own speeds: the words rush
// past first, then the stitched frame, and the photo last. Behind it the
// gallery's stamps wait one behind another, scattered like the works row;
// the wheel, a swipe or the arrow keys travel forward and back through them.
export const DEPTH = Object.freeze({
  perspective: 1000, spacing: 640, duration: 1000,
  fog: 3,        // stamps fade out this many spacings ahead
  pass: 360,     // and are gone this far past the camera
  wheel: 1.4,    // depth travelled per pixel of wheel or swipe
  glide: 140,    // ms for the camera to ease toward where it was sent
  approach: 1.5, // spacings the stamps travel in from as it opens
  intent: 60,    // px of wheel or swipe past an end that opens or closes it
  gesture: 200,  // ms of quiet that ends a wheel gesture
  top: 96, bottom: 150, side: 32,
});

// The hero's layers, each sent this far toward the camera, gone by `fade`.
const LAYERS = [
  { selector: '.project-intro, .project-facts, .project-overview', z: 900, fade: .35 },
  { selector: '.cover-frame', z: 650, fade: .55 },
  { selector: '.hero-postage-stamp, .cover-figure .project-image', z: 420, fade: .75 },
];

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const ease = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

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
    root.append(element);
    return { element, paper, media, x: 0, y: 0 };
  });
  const dots = Object.assign(document.createElement('nav'), { className: 'project-depth-dots' });
  dots.setAttribute('aria-label', 'Gallery');
  dots.append(...images.map((item, index) => {
    const dot = Object.assign(document.createElement('button'), { type: 'button', className: 'project-depth-dot' });
    dot.setAttribute('aria-label', `Image ${index + 1} of ${images.length}`);
    dot.addEventListener('click', () => { target = index * DEPTH.spacing; wake(); });
    return dot;
  }));
  document.body.append(root, dots);

  const label = seal.querySelector('.works-seal-label');
  seal.setAttribute('aria-controls', root.id);
  seal.setAttribute('aria-expanded', 'false');
  const reduced = () => motionPreference.matches;
  let open = false, busy = false, camera = 0, target = 0, appear = 0, current = -1, frame = null, last = null;
  let layers = [];

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
    render();
  }

  function render() {
    stamps.forEach((stamp, index) => {
      const z = camera - index * DEPTH.spacing;
      const opacity = depthOpacity(z) * appear;
      stamp.element.style.transform = `translate3d(${stamp.x.toFixed(1)}px, ${stamp.y.toFixed(1)}px, ${z.toFixed(1)}px)`;
      stamp.element.style.opacity = opacity.toFixed(3);
      stamp.element.style.visibility = opacity > 0 ? 'visible' : 'hidden';
    });
    const now = galleryCurrent(camera, stamps.length);
    if (now !== current) {
      current = now;
      [...dots.children].forEach((dot, index) => index === now ? dot.setAttribute('aria-current', 'true') : dot.removeAttribute('aria-current'));
    }
  }

  // The camera eases toward where the wheel, a swipe or a dot sent it.
  function wake() {
    target = clamp(target, 0, (stamps.length - 1) * DEPTH.spacing);
    if (reduced()) { camera = target; render(); return; }
    if (frame) return;
    frame = requestAnimationFrame(function step(now) {
      const elapsed = last === null ? 16 : Math.min(50, now - last);
      last = now;
      camera += (target - camera) * (1 - Math.exp(-elapsed / DEPTH.glide));
      if (Math.abs(target - camera) < .5) camera = target;
      render();
      frame = camera === target ? null : requestAnimationFrame(step);
      if (!frame) last = null;
    });
  }

  // The camera's flight in or out, with the stamps appearing alongside.
  function travel(from, to, appearFrom, appearTo) {
    const duration = reduced() ? 0 : DEPTH.duration;
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
        await Promise.all([partHero('reverse'), travel(camera, camera - DEPTH.spacing * DEPTH.approach, 1, 0)]);
        reset();
      }
    } catch {
      // A reset cancelled the move midway; it has already closed the gallery.
    }
    busy = false;
    // The gesture that got here must end before the wheel counts again, so
    // momentum never carries straight back through.
    settled = false;
    push = 0;
  }

  // Closed at once, the hero whole again.
  function reset() {
    cancelAnimationFrame(frame);
    frame = null;
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
  // scrolls to its end first. A gesture that reaches an end stops there; only
  // one that starts at it goes through.
  let push = 0, lastWheel = 0, settled = true, fromEnd = false;
  const arriving = () => document.body.classList.contains('project-arriving');
  const atPageEnd = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
  const atFirst = () => target <= 0 && camera < 1;
  // Adds a push past an end; past `intent`, it opens or closes the gallery.
  function pushPast(amount) {
    push += amount;
    if (push < DEPTH.intent) return;
    push = 0;
    toggle();
  }

  addEventListener('wheel', event => {
    const now = performance.now(), fresh = now - lastWheel > DEPTH.gesture;
    lastWheel = now;
    if (open) event.preventDefault();
    if (!settled && !fresh) return;
    settled = true;
    if (fresh) fromEnd = open ? atFirst() : atPageEnd();
    if (busy || arriving()) return;
    const raw = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    const delta = event.deltaMode === 1 ? raw * 40 : raw;
    if (!open) {
      if (delta > 0 && fromEnd && atPageEnd()) { event.preventDefault(); pushPast(delta); } else push = 0;
      return;
    }
    if (delta < 0 && atFirst()) { if (fromEnd) pushPast(-delta); return; }
    push = 0;
    target += delta * DEPTH.wheel;
    wake();
  }, { passive: false });

  let swipe = null, swipeFrom = null;
  let swipeFromEnd = false;
  addEventListener('touchstart', event => {
    swipe = swipeFrom = event.touches[0].clientY;
    swipeFromEnd = open ? atFirst() : atPageEnd();
  }, { passive: true });
  addEventListener('touchmove', event => {
    if (swipe === null || busy || arriving()) return;
    const y = event.touches[0].clientY;
    if (!open) {
      // A swipe up that starts at the end of the page opens it.
      if (swipeFromEnd && swipeFrom - y > DEPTH.intent) { swipe = null; toggle(); }
      return;
    }
    // A swipe down that starts at the first stamp closes it.
    if (swipeFromEnd && y - swipeFrom > DEPTH.intent) { swipe = null; toggle(); return; }
    target += (swipe - y) * DEPTH.wheel * 2;
    swipe = y;
    wake();
  }, { passive: true });
  addEventListener('touchend', () => { swipe = swipeFrom = null; }, { passive: true });

  addEventListener('keydown', event => {
    if (busy || arriving()) return;
    const step = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[event.key];
    if (!open) {
      // Down past the end of the page opens it, as the wheel does.
      if ((event.key === 'ArrowDown' || event.key === 'PageDown') && atPageEnd()) { event.preventDefault(); toggle(); }
      return;
    }
    if (event.key === 'Escape') { toggle(); return; }
    if (!step) return;
    event.preventDefault();
    const next = galleryCurrent(target, stamps.length) + step;
    // Up from the first stamp goes back to the cover.
    if (next < 0) { toggle(); return; }
    target = next * DEPTH.spacing;
    wake();
  });
  addEventListener('resize', () => { if (open) layout(); });
  seal.addEventListener('click', toggle);
  render();
  return { reset };
}
