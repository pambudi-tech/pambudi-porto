import { clamp } from '../shared/math.mjs';
import { EASE_OUT } from '../shared/motion.mjs';
import { stampOutline } from '../works/postage-stamp.mjs';

// A gallery image seen up close, as under a loupe: it grows out of its stamp
// to fill the screen, and shrinks back into it. A tap anywhere closes it
// (zoomed in, the first tap zooms back out); a pinch, the trackpad or + and
// - zoom by degrees, and a drag or the wheel pans. The arrows, the side
// buttons or a swipe go to the next image, endlessly, round from the last to
// the first, and Escape or "back" returns to the gallery.
export const CLOSEUP = Object.freeze({
  duration: 640, // ms the image takes to grow out of its stamp, or back
  swap: 280,     // ms one image takes to give way to the next
  most: 4,       // the furthest a pinch or the wheel zooms in
  swipe: 60,     // px a swipe travels to go to the next image
  drag: 4,       // px a press travels before it is a drag, not a click
  perf: 18,      // px between perforations up close; `perfPhone` on phones
  perfPhone: 14,
});

const EASE = EASE_OUT;
// Growing out of its stamp and back, as gently as the gallery's own flights.
const GROW = 'cubic-bezier(.65, 0, .35, 1)';

// The room the image fills: clear of the top bar, and of the side buttons,
// which sit below it on a phone.
export const closeupRoom = (width, height) => width <= 760
  ? { width, height, top: 68, bottom: 84, side: 16 }
  : { width, height, top: 76, bottom: 40, side: 84 };

// The largest rect of the image's aspect that fits the room, centred in it.
export function fitRect(aspect, { width, height, top, bottom, side }) {
  const roomWidth = Math.max(1, width - side * 2), roomHeight = Math.max(1, height - top - bottom);
  const w = Math.min(roomWidth, roomHeight * aspect), h = w / aspect;
  return { left: (width - w) / 2, top: top + (roomHeight - h) / 2, width: w, height: h };
}

// A view of the image, { scale, x, y }, kept covering its frame.
export const panTo = ({ scale, x, y }, frame) => ({
  scale,
  x: clamp(x, frame.width * (1 - scale), 0),
  y: clamp(y, frame.height * (1 - scale), 0),
});

// The view zoomed to `scale` about `point` in the frame, the spot under it
// held still.
export function zoomAt(view, point, scale, frame) {
  const next = clamp(scale, 1, CLOSEUP.most), ratio = next / view.scale;
  return panTo({ scale: next, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }, frame);
}

const FIT = Object.freeze({ scale: 1, x: 0, y: 0 });
const rectOf = element => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};
const px = rect => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });

// `sourceOf(index)` is the stamp an image grows from and returns to;
// `onIndex` hears of the image shown, and `onClose` of the close-up gone.
export function mountCloseup({ images, motionPreference, sourceOf, onIndex, onClose }) {
  const root = Object.assign(document.createElement('div'), { className: 'project-closeup', hidden: true });
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = '<div class="project-closeup-backdrop"></div>'
    + '<div class="project-closeup-frame"><div class="project-closeup-paper"></div></div>'
    + '<div class="project-closeup-bar"><button class="project-closeup-back" type="button">back</button><span class="project-closeup-count" aria-live="polite"></span></div>'
    + '<button class="project-closeup-step" type="button" data-step="-1" aria-label="Previous image"></button>'
    + '<button class="project-closeup-step" type="button" data-step="1" aria-label="Next image"></button>';
  document.body.append(root);
  const backdrop = root.querySelector('.project-closeup-backdrop');
  const frame = root.querySelector('.project-closeup-frame');
  // The image lies on a postage stamp's paper, cut to its perforations by
  // the cards' own outline (postage-stamp.mjs): holes evenly spaced from
  // corner to corner, a quarter bite at each. It is redrawn at every size the
  // frame takes, growing or shrinking, before that size is drawn. The frame
  // carries the paper's shadow.
  const paper = frame.firstChild;
  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (!width || !height) return;
    const perf = innerWidth <= 760 ? CLOSEUP.perfPhone : CLOSEUP.perf;
    paper.style.clipPath = `path('${stampOutline(width, height, perf)}')`;
  }).observe(paper);
  const back = root.querySelector('.project-closeup-back');
  const count = root.querySelector('.project-closeup-count');
  const steps = [...root.querySelectorAll('.project-closeup-step')];
  const controls = [root.querySelector('.project-closeup-bar'), ...steps];
  const reduced = () => motionPreference.matches;
  const time = length => reduced() ? 0 : length;

  let active = -1, closing = false, image = null, view = FIT, box = null;

  const aspectOf = index => images[index].width / images[index].height;
  const place = () => { box = fitRect(aspectOf(active), closeupRoom(innerWidth, innerHeight)); Object.assign(frame.style, px(box)); };

  function show(next, animated = false) {
    view = next;
    image.style.transition = animated && !reduced() ? `transform 420ms ${EASE}` : 'none';
    image.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    frame.toggleAttribute('data-zoomed', view.scale > 1.01);
  }

  function picture(index) {
    const item = images[index];
    // Asked for as its stamp asked (project-gallery.mjs), so the photo
    // already fetched and decoded there is the one shown.
    const img = Object.assign(new Image(item.width, item.height), { crossOrigin: 'anonymous', src: item.src, alt: item.alt, draggable: false, decoding: 'async' });
    paper.append(img);
    return img;
  }

  function label() {
    count.textContent = `${active + 1} / ${images.length}`;
    root.setAttribute('aria-label', `Image ${active + 1} of ${images.length}`);
    steps[0].disabled = steps[1].disabled = images.length < 2;
  }

  function open(index) {
    if (active >= 0 || closing) return;
    active = index;
    const source = sourceOf(index), from = rectOf(source);
    root.hidden = false;
    document.body.classList.add('closeup-open');
    paper.replaceChildren();
    image = picture(index);
    show(FIT);
    label();
    place();
    source.classList.add('is-closeup-source');
    const duration = time(CLOSEUP.duration);
    frame.animate([px(from), px(box)], { duration, easing: GROW });
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'ease' });
    controls.forEach(control => control.animate([{ opacity: 0 }, { opacity: 1 }], { duration: time(320), delay: time(CLOSEUP.duration * .45), easing: 'ease', fill: 'backwards' }));
    back.focus({ preventScroll: true });
  }

  async function close() {
    if (active < 0 || closing) return;
    closing = true;
    const source = sourceOf(active), to = rectOf(source), from = rectOf(frame);
    show(FIT, true);
    const duration = time(CLOSEUP.duration);
    controls.forEach(control => control.animate([{ opacity: 1 }, { opacity: 0 }], { duration: time(160), easing: 'ease', fill: 'forwards' }));
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease', fill: 'forwards' });
    await frame.animate([px(from), px(to)], { duration, easing: GROW, fill: 'forwards' }).finished.catch(() => {});
    if (!closing) return;
    finish();
    source.focus?.({ preventScroll: true });
  }

  // Gone at once, its stamp back in its place.
  function finish() {
    if (active >= 0) sourceOf(active).classList.remove('is-closeup-source');
    root.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    root.hidden = true;
    document.body.classList.remove('closeup-open');
    paper.replaceChildren();
    active = -1;
    closing = false;
    image = null;
    onClose();
  }
  const reset = () => { if (active >= 0) finish(); };

  // The image gives way to its neighbour, sliding off the way it came from,
  // and the frame takes the new one's shape.
  // Endless both ways: after the last comes the first, before the first the
  // last.
  function step(direction) {
    if (active < 0 || closing || images.length < 2) return;
    const next = (active + direction + images.length) % images.length;
    const old = image, from = rectOf(frame);
    sourceOf(active).classList.remove('is-closeup-source');
    active = next;
    onIndex(next);
    sourceOf(next).classList.add('is-closeup-source');
    image = picture(next);
    show(FIT);
    label();
    place();
    const duration = time(CLOSEUP.swap);
    frame.animate([px(from), px(box)], { duration, easing: EASE });
    // A little blur as they cross, so the two read as one image changing.
    old.animate([{ translate: '0 0', opacity: 1, filter: 'blur(0)' }, { translate: `${-direction * 8}% 0`, opacity: 0, filter: 'blur(2px)' }], { duration, easing: EASE, fill: 'forwards' })
      .finished.catch(() => {}).then(() => old.remove());
    image.animate([{ translate: `${direction * 8}% 0`, opacity: 0, filter: 'blur(2px)' }, { translate: '0 0', opacity: 1, filter: 'blur(0)' }], { duration, easing: EASE });
  }

  const pointIn = event => {
    const { left, top } = frame.getBoundingClientRect();
    return { x: event.clientX - left, y: event.clientY - top };
  };

  // One finger or the mouse: a tap closes, or zooms back out first when
  // zoomed in; a drag pans when zoomed and swipes to a neighbour when not.
  // Two fingers pinch.
  const pointers = new Map();
  let press = null, pinch = null;
  frame.addEventListener('pointerdown', event => {
    if (closing || (event.pointerType === 'mouse' && event.button !== 0)) return;
    frame.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, event);
    if (pointers.size === 1) press = { x: event.clientX, y: event.clientY, view, moved: false };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), view };
      press = null;
    }
  });
  frame.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, event);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const middle = pointIn({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 });
      show(zoomAt(view, middle, pinch.view.scale * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.distance, box));
      return;
    }
    if (!press) return;
    const dx = event.clientX - press.x, dy = event.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < CLOSEUP.drag) return;
    press.moved = true;
    frame.classList.add('is-dragging');
    if (press.view.scale > 1.01) show(panTo({ ...press.view, x: press.view.x + dx, y: press.view.y + dy }, box));
    // Not zoomed, the image follows the swipe a little.
    else image.style.translate = `${dx * .35}px 0`;
  });
  function release(event) {
    if (!pointers.delete(event.pointerId)) return;
    frame.classList.remove('is-dragging');
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (!press) return;
    const { moved, view: before } = press, dx = event.clientX - press.x;
    press = null;
    if (event.type === 'pointercancel') { image.style.translate = ''; return; }
    if (!moved) {
      if (view.scale > 1.01) show(FIT, true);
      else close();
      return;
    }
    if (before.scale > 1.01) return;
    image.animate([{ translate: image.style.translate || '0 0' }, { translate: '0 0' }], { duration: time(240), easing: EASE });
    image.style.translate = '';
    if (Math.abs(dx) >= CLOSEUP.swipe) step(-Math.sign(dx));
  }
  frame.addEventListener('pointerup', release);
  frame.addEventListener('pointercancel', release);

  // A trackpad's pinch, or the wheel with ctrl, zooms; scrolling pans a
  // zoomed image. Nothing scrolls the page or the gallery beneath.
  root.addEventListener('wheel', event => {
    event.preventDefault();
    if (closing || !image) return;
    const delta = event.deltaMode === 1 ? 40 : 1;
    if (event.ctrlKey) show(zoomAt(view, pointIn(event), view.scale * Math.exp(-event.deltaY * delta * .01), box));
    else if (view.scale > 1.01) show(panTo({ ...view, x: view.x - event.deltaX * delta, y: view.y - event.deltaY * delta }, box));
  }, { passive: false });

  addEventListener('keydown', event => {
    if (active < 0 || closing) return;
    const centre = { x: box.width / 2, y: box.height / 2 };
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') step(-1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') step(1);
    else if (event.key === '+' || event.key === '=') show(zoomAt(view, centre, view.scale * 1.5, box), true);
    else if (event.key === '-') show(zoomAt(view, centre, view.scale / 1.5, box), true);
    else if (event.key === 'Tab') {
      // Focus stays within the close-up while it is open.
      const stops = [back, ...steps].filter(button => !button.disabled);
      const at = stops.indexOf(document.activeElement);
      stops[(at + (event.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
    } else return;
    event.preventDefault();
  });

  back.addEventListener('click', close);
  // A tap anywhere around the image closes it too.
  backdrop.addEventListener('click', close);
  steps.forEach(button => button.addEventListener('click', () => step(Number(button.dataset.step))));
  addEventListener('resize', () => { if (active >= 0 && !closing) { place(); show(FIT); } });

  return { open, close, reset, isOpen: () => active >= 0 };
}
