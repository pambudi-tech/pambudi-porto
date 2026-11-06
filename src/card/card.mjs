import { PaperGL, lightPosition } from '../paper/paper-gl.mjs';
import { inkBrightness } from '../paper/paper-ink-light.mjs';
import { paperTarget, advancePaper } from '../paper/paper-motion.mjs';
import { paperFlipKeyframes, paperFlipDirection, PAPER_FLIP } from '../paper/paper-flip.mjs';

// The card: the homepage's paper on its own. A mouse anywhere on the page
// brings the lamp to it; over the sheet it tilts; a tap turns it over, and
// a drag spins it in place.
// Its dimensions, for a printer, are always drawn on it.

// The card's cut size, from the supplied die line (tools/card-sources/
// card-cut.svg, tools/card_geometry.py). On the paper image it is
// 1045.19 × 1310.08 px of 1122 × 1376 (card.css sizes the card by it).
const CARD_HEIGHT_MM = 85;
const CARD_MM = Object.freeze({ width: 67.75, height: CARD_HEIGHT_MM });

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const paper = document.querySelector('.paper');
const turn = paper.querySelector('.paper-turn');
const sheets = [...paper.querySelectorAll('.sheet')];
const faces = [new PaperGL(sheets[0], 'white'), new PaperGL(sheets[1], 'whiteBack')];

const pointer = { x: 0, y: 0, hovered: false, lit: false, pressed: false };
const target = () => paperTarget({ ...pointer, reduced: motion.matches });
let pose = target(), angle = 0, turning = null, rect = null;

// Read on resize and scroll only, never while drawing.
const measure = () => { rect = paper.getBoundingClientRect(); };

// —— The printed lines ——
// They take the paper's lamp as the homepage's ink does (paper-ink-light.mjs):
// a touch lighter as it comes over a line, with a faint sheen right beneath
// it, a touch darker as it moves away, and their own colour at rest. Where
// each line sits on the sheet is read once, after a resize or the font's
// arrival, never while lighting, and only for the face showing.
const PAPER_ASPECT = 1122 / 1376;
const REST_LAMP = lightPosition({}, PAPER_ASPECT);
// Each face's ink: the front's lines; the back is bare.
const inkOn = [[...paper.querySelectorAll('.card-copy span')], []];
let ink = [null, null];
function measureInk(i) {
  const frame = sheets[i].getBoundingClientRect();
  if (!frame.height) return null;
  return inkOn[i].map(element => {
    const box = element.getBoundingClientRect();
    return { element, brightness: 1, at: [(box.left + box.width / 2 - frame.left - frame.width / 2) / frame.height,
      (box.top + box.height / 2 - frame.top - frame.height / 2) / frame.height] };
  });
}
function lightInk() {
  const i = showing();
  ink[i] ??= measureInk(i);
  if (!ink[i]) return;
  const lamp = lightPosition(pose, PAPER_ASPECT);
  for (const line of ink[i]) {
    const brightness = inkBrightness(line.at, lamp, REST_LAMP);
    // Small changes wait for a larger one, except the return to rest.
    if (brightness === line.brightness || (brightness !== 1 && Math.abs(brightness - line.brightness) < .004)) continue;
    line.brightness = brightness;
    line.element.style.filter = brightness === 1 ? '' : `brightness(${brightness.toFixed(3)})`;
  }
}
document.fonts.ready.then(() => { ink = [null, null]; request(); });

// The face showing: the front at 0°, the back at 180°.
const showing = () => (angle === 180 ? 1 : 0);

// As on the homepage (paper-interaction.mjs), only the face showing is lit
// and shaded, and nothing is drawn while the card turns in 3D: there, every
// pointer move redrew both WebGL faces and both sheets' shadows, and the
// turn dropped to about 30 fps.


// A face's shadow on the page; turned over, the back's runs the other way.
function shade(i) {
  const sheet = sheets[i];
  sheet.style.setProperty('--sx', `${(i ? -pose.sx : pose.sx).toFixed(3)}px`);
  sheet.style.setProperty('--sy', `${pose.sy.toFixed(3)}px`);
  sheet.style.setProperty('--blur', `${pose.blur.toFixed(3)}px`);
  sheet.style.setProperty('--shadow', pose.opacity.toFixed(4));
}
function write() {
  paper.style.transform = `perspective(1200px) rotateX(${pose.rx.toFixed(3)}deg) rotateY(${pose.ry.toFixed(3)}deg) scale(${pose.scale.toFixed(5)})`;
  shade(showing());
  // Turned round twice over, the back faces the viewer unmirrored: the same lamp.
  faces[showing()].draw(pose);
  lightInk();
}

let frame = null, last = null;
function tick(now) {
  frame = null;
  if (turning) return;
  const elapsed = last === null ? 16 : now - last;
  last = now;
  const next = target();
  pose = advancePaper(pose, next, elapsed);
  write();
  if (Object.keys(next).some(key => pose[key] !== next[key])) request();
  else last = null;
}
const request = () => { if (!turning) frame ??= requestAnimationFrame(tick); };

function turnOver(direction) {
  if (turning) return;
  // Light both faces alike first, so neither changes as it comes round, and
  // let go of the tilt and press: the turn plays on the compositor alone.
  pointer.hovered = pointer.pressed = false;
  pose = target();
  faces.forEach((face, i) => { face.draw(pose); shade(i); });
  write();
  const from = angle, to = angle + 180 * direction;
  angle = ((to % 360) + 360) % 360;
  paper.setAttribute('aria-label', angle === 180 ? 'Turn the card to its front' : 'Turn the card to its back');
  if (motion.matches) { turn.style.transform = `rotateY(${angle}deg)`; return; }
  cancelAnimationFrame(frame);
  frame = null;
  last = null;
  turning = turn.animate(paperFlipKeyframes(from, to), { duration: PAPER_FLIP.duration, fill: 'forwards' });
  turning.finished.then(() => {
    turn.style.transform = `rotateY(${angle}deg)`;
    turning.cancel();
    turning = null;
    // Round again: the face now showing takes the shadow, then the sheet
    // eases back under the pointer.
    write();
    request();
  });
}

// The lamp follows a mouse anywhere on the page; the sheet tilts only under it.
addEventListener('pointermove', event => {
  if (!rect) return;
  const { clientX: x, clientY: y } = event;
  const mouse = event.pointerType === 'mouse';
  pointer.x = (x - rect.left - rect.width / 2) / (rect.width / 2);
  pointer.y = (y - rect.top - rect.height / 2) / (rect.height / 2);
  pointer.lit = mouse;
  pointer.hovered = mouse && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  request();
}, { passive: true });
document.documentElement.addEventListener('mouseleave', () => {
  pointer.lit = pointer.hovered = false;
  request();
});

// —— Spinning ——
// The card stays where it is, in the middle. A press that travels further
// than SPIN_START spins it: across, round its upright axis (on round to its
// back), up and down, a little tilt. Let go, it carries on with the swipe's
// speed and settles face on, front or back. A click still turns it over.
const SPIN_START = 6;
const SPIN = Object.freeze({ degreesPerPx: .45, tiltPerPx: .3, tiltMax: 45, carryMs: 220, msPerDegree: 2.6, minMs: 280, maxMs: 1100 });
let spin = null, spun = false;
const turnTransform = (x, y) => `rotateX(${x.toFixed(2)}deg) rotateY(${y.toFixed(2)}deg)`;

paper.addEventListener('pointerdown', event => {
  if (event.button !== 0 || turning || touches.size) return;
  spun = false;
  paper.setPointerCapture(event.pointerId);
  spin = { id: event.pointerId, x: event.clientX, y: event.clientY, from: angle, angle, tilt: 0, moving: false, samples: [] };
  pointer.pressed = true;
  request();
});
paper.addEventListener('pointermove', event => {
  if (!spin || event.pointerId !== spin.id) return;
  const dx = event.clientX - spin.x, dy = event.clientY - spin.y;
  if (!spin.moving) {
    if (Math.hypot(dx, dy) < SPIN_START) return;
    spin.moving = true;
    paper.classList.add('spinning');
    // As before a turn: both faces lit alike, the tilt and press let go,
    // and nothing drawn while it spins.
    pointer.hovered = pointer.pressed = false;
    pose = target();
    faces.forEach((face, i) => { face.draw(pose); shade(i); });
    write();
    cancelAnimationFrame(frame);
    frame = null;
    last = null;
    turning = true;
  }
  spin.angle = spin.from + dx * SPIN.degreesPerPx;
  spin.tilt = Math.max(-SPIN.tiltMax, Math.min(SPIN.tiltMax, -dy * SPIN.tiltPerPx));
  const now = event.timeStamp;
  spin.samples.push([now, spin.angle]);
  while (spin.samples.length > 2 && now - spin.samples[0][0] > 90) spin.samples.shift();
  turn.style.transform = turnTransform(spin.tilt, spin.angle);
});
function letGo(event) {
  if (!spin || event.pointerId !== spin.id) return;
  const { moving, samples, tilt } = spin;
  let from = spin.angle;
  spin = null;
  pointer.pressed = false;
  if (!moving) { request(); return; }
  spun = true;
  paper.classList.remove('spinning');
  // Carried on by the swipe's speed, to the nearest face.
  const [[t0, a0]] = samples, [t1, a1] = samples.at(-1);
  const speed = t1 > t0 ? (a1 - a0) / (t1 - t0) : 0;
  const to = Math.round((from + speed * SPIN.carryMs) / 180) * 180;
  const duration = motion.matches ? 0 : Math.min(SPIN.maxMs, Math.max(SPIN.minMs, Math.abs(to - from) * SPIN.msPerDegree));
  settle(from, tilt, to, duration);
}
function settle(from, tilt, to, duration) {
  angle = ((to % 360) + 360) % 360;
  paper.setAttribute('aria-label', angle === 180 ? 'Turn the card to its front' : 'Turn the card to its back');
  const done = () => {
    turn.style.transform = `rotateY(${angle}deg)`;
    turning = null;
    write();
    request();
  };
  if (!duration) { done(); return; }
  turning = turn.animate([{ transform: turnTransform(tilt, from) }, { transform: turnTransform(0, to) }],
    { duration, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' });
  turning.finished.then(() => { turning.cancel(); done(); });
}
paper.addEventListener('pointerup', letGo);
paper.addEventListener('pointercancel', letGo);
paper.addEventListener('click', event => {
  if (spun) { spun = false; return; }
  turnOver(paperFlipDirection(event.clientX, rect));
});
// Enter or Space turns it over; the arrow keys turn it either way.
paper.addEventListener('keydown', event => {
  const direction = { Enter: 1, ' ': 1, ArrowRight: 1, ArrowLeft: -1 }[event.key];
  if (!direction) return;
  event.preventDefault();
  turnOver(direction);
});

// —— Dimensions ——
// —— Real size ——
// A page can't learn a screen's physical size: CSS millimetres assume 96
// CSS px to the inch, and most laptops and phones are denser, so they come
// out short. Matching a bank card on screen gives this screen's own scale,
// kept in this browser. Until then the card shows at the scale calibrated
// against a real bank card on Ivan's 16-inch MacBook Pro (default scaling,
// about 127 CSS px to the inch), the screen it was designed on.
const SCALE_KEY = 'card.pambudi.xyz/scale';
const SOURCE_SCALE = 1.326;
const readScale = () => {
  try {
    const value = parseFloat(localStorage.getItem(SCALE_KEY));
    return value >= .5 && value <= 2.5 ? value : SOURCE_SCALE;
  } catch { return SOURCE_SCALE; }
};
let scale = readScale();

const dialog = document.querySelector('.calibrate');
const slider = dialog.querySelector('input[type="range"]');
const preview = value => {
  slider.value = value;
  dialog.style.setProperty('--scale', String(value));
};
document.querySelector('.calibrate-open').addEventListener('click', () => {
  preview(scale);
  dialog.showModal();
});
slider.addEventListener('input', () => preview(Number(slider.value)));
for (const button of dialog.querySelectorAll('[data-step]')) button.addEventListener('click', () => {
  const next = Number(slider.value) + Number(button.dataset.step) * .002;
  preview(Math.min(2.5, Math.max(.5, next)).toFixed(3));
});
dialog.querySelector('[data-reset]').addEventListener('click', () => preview(SOURCE_SCALE));
dialog.querySelector('[data-done]').addEventListener('click', () => {
  scale = Number(slider.value);
  try { localStorage.setItem(SCALE_KEY, String(scale)); } catch { /* kept for this visit only */ }
  applyZoom(true);
  dialog.close();
});
const millimetres = value => `${Number(value.toFixed(2))} mm`;
for (const [name, value] of Object.entries(CARD_MM))
  for (const label of document.querySelectorAll(`[data-dim="${name}"]`)) label.textContent = millimetres(value);
document.querySelector('[data-dim-summary]').textContent =
  `The card measures ${millimetres(CARD_MM.width)} wide by ${millimetres(CARD_MM.height)} high.`;

// —— Downloads ——
// A menu of the production files over its button: opened by it, closed by
// it, by Escape (back to the button), by a choice, or by a press elsewhere.
const download = document.querySelector('.download');
const downloadOpen = download.querySelector('.download-open');
const downloadLinks = [...download.querySelectorAll('a')];
function showDownloads(open, { focus = false } = {}) {
  download.toggleAttribute('data-open', open);
  downloadOpen.setAttribute('aria-expanded', String(open));
  if (open && focus) downloadLinks[0].focus();
}
downloadOpen.addEventListener('click', event => {
  const open = !download.hasAttribute('data-open');
  // From the keyboard (no pointer), focus goes into the menu.
  showDownloads(open, { focus: open && event.detail === 0 });
});
download.addEventListener('keydown', event => {
  const i = downloadLinks.indexOf(document.activeElement);
  if (event.key === 'Escape' && download.hasAttribute('data-open')) {
    showDownloads(false);
    downloadOpen.focus();
  } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && download.hasAttribute('data-open')) {
    const next = i < 0 ? 0 : (i + (event.key === 'ArrowDown' ? 1 : -1) + downloadLinks.length) % downloadLinks.length;
    downloadLinks[next].focus();
  } else return;
  event.preventDefault();
  event.stopPropagation();
});
for (const link of downloadLinks) link.addEventListener('click', () => showDownloads(false));
addEventListener('pointerdown', event => {
  if (download.hasAttribute('data-open') && !download.contains(event.target)) showDownloads(false);
});
download.addEventListener('focusout', event => {
  if (!download.contains(event.relatedTarget)) showDownloads(false);
});

// —— Zoom ——
// Closer in, to see the press of the frame. While it moves, the card is
// scaled as a picture, on the compositor; once it has stood still a moment
// it is laid out at that size, so the WebGL paper and the type redraw sharp
// and the dimension lines go back to their own size. (Laid out afresh every
// frame, larger, it dropped to 20–30 fps.) Pinching, or ⌘/Ctrl and
// scrolling, zooms about the pointer; scrolling, or dragging the page round
// the card, pans once the card is larger than the window. The buttons and
// the + and − keys step about the middle; 0, or the figure, goes back to
// real size.
const ZOOM = Object.freeze({ min: 1, max: 4, levels: [1, 1.5, 2, 3, 4], settleMs: 90, slack: 48, layAfterMs: 140 });
const cardBox = document.querySelector('.card');
const zoomLevel = document.querySelector('[data-zoom-level]');
const zoomOut = document.querySelector('[data-zoom="-1"]');
const zoomIn = document.querySelector('[data-zoom="1"]');
let zoom = 1, pan = [0, 0];       // shown
let zoomTo = 1, panTo = [0, 0];   // aimed for
let laid = 1;                     // the zoom the card is laid out at
let base = null;                  // the card's laid-out size at zoom 1, in px
let view = [innerWidth, innerHeight];
let shownLevel = null, layTimer = null;

const clampZoom = value => Math.min(ZOOM.max, Math.max(ZOOM.min, value));
// Far enough to zoom about any point on the card (its edges come in no
// further than they sit at real size), or, larger than the window, to bring
// either edge in from the window's, and a little more.
function clampPan([x, y], z) {
  if (!base) return [0, 0];
  const room = (size, window) => Math.max(size * (z - 1) / 2, size * z > window ? (size * z - window) / 2 + ZOOM.slack : 0);
  const rx = room(base[0], view[0]), ry = room(base[1], view[1]);
  return [Math.min(rx, Math.max(-rx, x)), Math.min(ry, Math.max(-ry, y))];
}
const pannable = () => clampPan([1e6, 1e6], zoomTo).some(Boolean);
// The point `at` (in the window) stays put while the zoom becomes `next`.
function aim(next, at) {
  next = clampZoom(next);
  const [ax, ay] = at ? [at[0] - view[0] / 2, at[1] - view[1] / 2] : [0, 0];
  const k = next / zoomTo;
  panTo = clampPan([ax - (ax - panTo[0]) * k, ay - (ay - panTo[1]) * k], next);
  zoomTo = next;
}
const layOut = () => paper.style.setProperty('--card-height', `${(CARD_HEIGHT_MM * scale * laid).toFixed(3)}mm`);
function place() {
  const s = zoom / laid;
  cardBox.style.transform = `translate(${pan[0].toFixed(2)}px, ${pan[1].toFixed(2)}px)${s === 1 ? '' : ` scale(${s.toFixed(5)})`}`;
  // Where the card now is, for the lamp, worked out rather than read back.
  if (base) {
    const w = base[0] * zoom, h = base[1] * zoom;
    rect = new DOMRect(view[0] / 2 + pan[0] - w / 2, view[1] / 2 + pan[1] - h / 2, w, h);
  }
}
// Once still, laid out at the zoom it shows: the same size on screen.
function lay() {
  layTimer = null;
  if (zoomFrame) { layTimer = setTimeout(lay, ZOOM.layAfterMs); return; }
  if (laid === zoom) return;
  laid = zoom;
  layOut();
  place();
}
function applyZoom(force = false) {
  if (force) { laid = zoom; layOut(); }
  place();
  if (zoom !== laid) { clearTimeout(layTimer); layTimer = setTimeout(lay, ZOOM.layAfterMs); }
  const level = Math.round(zoom * 100);
  if (level !== shownLevel) { shownLevel = level; zoomLevel.textContent = `${level}%`; }
  zoomOut.disabled = zoomTo <= ZOOM.min;
  zoomIn.disabled = zoomTo >= ZOOM.max;
  document.documentElement.classList.toggle('pannable', pannable());
}

// Steps and keys glide; pinches and scrolls follow the hand, one write a frame.
let zoomFrame = null, zoomLast = null, following = false;
function zoomTick(now) {
  zoomFrame = null;
  const dt = zoomLast === null ? 16 : Math.min(64, now - zoomLast);
  zoomLast = now;
  const f = following || motion.matches ? 1 : 1 - Math.exp(-dt / ZOOM.settleMs);
  zoom += (zoomTo - zoom) * f;
  pan = pan.map((value, i) => value + (panTo[i] - value) * f);
  if (Math.abs(zoomTo - zoom) < .001 && Math.hypot(panTo[0] - pan[0], panTo[1] - pan[1]) < .25) {
    zoom = zoomTo;
    pan = [...panTo];
    zoomLast = null;
  } else zoomFrame = requestAnimationFrame(zoomTick);
  following = false;
  applyZoom();
}
const glide = () => { zoomFrame ??= requestAnimationFrame(zoomTick); };
const follow = () => { following = true; glide(); };

function step(direction) {
  const next = direction > 0 ? ZOOM.levels.find(level => level > zoomTo + .01) : ZOOM.levels.findLast(level => level < zoomTo - .01);
  aim(next ?? (direction > 0 ? ZOOM.max : ZOOM.min));
  glide();
}
function resetZoom() {
  zoomTo = 1;
  panTo = [0, 0];
  glide();
}
zoomOut.addEventListener('click', () => step(-1));
zoomIn.addEventListener('click', () => step(1));
document.querySelector('[data-zoom-reset]').addEventListener('click', resetZoom);
addEventListener('keydown', event => {
  if (dialog.open || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  if (key === '+' || key === '=') step(1);
  else if (key === '-' || key === '_') step(-1);
  else if (key === '0') resetZoom();
  else return;
  event.preventDefault();
});

// A trackpad's pinch arrives as Ctrl and scroll (Chrome, Firefox) or as
// gesture events (Safari); a plain scroll pans.
addEventListener('wheel', event => {
  if (dialog.open) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view[1] : 1;
  if (event.ctrlKey || event.metaKey) {
    const delta = Math.max(-25, Math.min(25, event.deltaY * unit));
    aim(zoomTo * Math.exp(-delta * .01), [event.clientX, event.clientY]);
  } else {
    const [dx, dy] = event.shiftKey && !event.deltaX ? [event.deltaY, 0] : [event.deltaX, event.deltaY];
    panTo = clampPan([panTo[0] - dx * unit, panTo[1] - dy * unit], zoomTo);
  }
  follow();
}, { passive: false });
let gestureFrom = null;
addEventListener('gesturestart', event => { event.preventDefault(); if (!touches.size) gestureFrom = zoomTo; });
addEventListener('gesturechange', event => {
  event.preventDefault();
  if (gestureFrom === null || touches.size) return;
  aim(gestureFrom * event.scale, [event.clientX, event.clientY]);
  follow();
});
addEventListener('gestureend', event => { event.preventDefault(); gestureFrom = null; });

// Touch: two fingers pinch and carry the card; a spin under way lets go of
// it first. One finger, or a mouse, off the card drags the page round it.
const touches = new Map();
let pinch = null, drag = null;
function dropSpin() {
  if (!spin) return;
  const { moving, angle: from, tilt } = spin;
  spin = null;
  pointer.pressed = false;
  spun = true;
  if (!moving) { request(); return; }
  paper.classList.remove('spinning');
  settle(from, tilt, Math.round(from / 180) * 180, motion.matches ? 0 : SPIN.minMs);
}
const pinchFrom = () => {
  const [a, b] = [...touches.values()];
  return { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])) };
};
const space = document.querySelector('.space');
space.addEventListener('pointerdown', event => {
  if (dialog.open) return;
  if (event.pointerType === 'touch') {
    touches.set(event.pointerId, [event.clientX, event.clientY]);
    if (touches.size === 2) {
      dropSpin();
      drag = null;
      document.documentElement.classList.remove('panning');
      pinch = { ...pinchFrom(), zoom: zoomTo, pan: [...panTo] };
      return;
    }
  }
  if (event.button !== 0 || touches.size > 1 || !pannable() || paper.contains(event.target) || event.target.closest('.controls')) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: [...panTo] };
  space.setPointerCapture(event.pointerId);
  document.documentElement.classList.add('panning');
});
addEventListener('pointermove', event => {
  if (touches.has(event.pointerId)) touches.set(event.pointerId, [event.clientX, event.clientY]);
  if (pinch && touches.size >= 2) {
    const { mid, dist } = pinchFrom();
    const next = clampZoom(pinch.zoom * dist / pinch.dist), k = next / pinch.zoom;
    const from = [pinch.mid[0] - view[0] / 2, pinch.mid[1] - view[1] / 2];
    const to = [mid[0] - view[0] / 2, mid[1] - view[1] / 2];
    zoomTo = next;
    panTo = clampPan([to[0] - (from[0] - pinch.pan[0]) * k, to[1] - (from[1] - pinch.pan[1]) * k], next);
    follow();
  } else if (drag && event.pointerId === drag.id) {
    panTo = clampPan([drag.pan[0] + event.clientX - drag.x, drag.pan[1] + event.clientY - drag.y], zoomTo);
    follow();
  }
}, { passive: true });
function lift(event) {
  touches.delete(event.pointerId);
  if (touches.size < 2) pinch = null;
  if (drag && event.pointerId === drag.id) {
    drag = null;
    document.documentElement.classList.remove('panning');
  }
}
addEventListener('pointerup', lift);
addEventListener('pointercancel', lift);

addEventListener('resize', () => {
  view = [innerWidth, innerHeight];
  panTo = clampPan(panTo, zoomTo);
  glide();
});

new ResizeObserver(() => {
  measure();
  // The ink's places are shares of the sheet's height, so a zoom keeps them;
  // only a new size at zoom 1 (calibration, a new window) reads them again.
  const next = [paper.offsetWidth / laid, paper.offsetHeight / laid];
  if (!base || Math.abs(next[0] - base[0]) > .5) ink = [null, null];
  base = next;
  document.documentElement.classList.toggle('pannable', pannable());
  request();
}).observe(paper);
addEventListener('scroll', measure, { passive: true });
applyZoom(true);
measure();
base = [paper.offsetWidth, paper.offsetHeight];
write();

// The photographs show until each WebGL face is ready; without WebGL 2 on a
// graphics card they simply stay.
for (const face of faces) face.prepare().then(request, error => console.info('Card stays a photograph:', error.message));
