import { PaperGL } from '../paper/paper-gl.mjs';
import { paperTarget, advancePaper } from '../paper/paper-motion.mjs';
import { paperFlipKeyframes, paperFlipDirection, PAPER_FLIP } from '../paper/paper-flip.mjs';

// The card: the homepage's paper on its own. A mouse anywhere on the page
// brings the lamp to it; over the sheet it tilts; a tap turns it over, and
// a drag spins it in place.
// Its dimensions, for a printer, are always drawn on it.

// The card's cut size: its height is set, its width follows the sheet's
// own proportion, as drawn (its outline is 1030 × 1330 px of the image).
const CARD_HEIGHT_MM = 85;
const SHEET = Object.freeze({ width: 1030, height: 1330 });
const CARD_MM = Object.freeze({ width: CARD_HEIGHT_MM * SHEET.width / SHEET.height, height: CARD_HEIGHT_MM });

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const paper = document.querySelector('.paper');
const turn = paper.querySelector('.paper-turn');
const sheets = [...paper.querySelectorAll('.sheet')];
const faces = [new PaperGL(sheets[0], 'white'), new PaperGL(sheets[1], 'red')];

const pointer = { x: 0, y: 0, hovered: false, lit: false, pressed: false };
const target = () => paperTarget({ ...pointer, reduced: motion.matches });
let pose = target(), angle = 0, turning = null, rect = null;

// Read on resize and scroll only, never while drawing.
const measure = () => { rect = paper.getBoundingClientRect(); };

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
  if (event.button !== 0 || turning) return;
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
const millimetres = value => `${Number(value.toFixed(2))} mm`;
for (const [name, value] of Object.entries(CARD_MM))
  for (const label of document.querySelectorAll(`[data-dim="${name}"]`)) label.textContent = millimetres(value);
document.querySelector('[data-dim-summary]').textContent =
  `The card measures ${millimetres(CARD_MM.width)} wide by ${millimetres(CARD_MM.height)} high.`;

new ResizeObserver(() => { measure(); request(); }).observe(paper);
addEventListener('scroll', measure, { passive: true });
measure();
write();

// The photographs show until each WebGL face is ready; without WebGL 2 on a
// graphics card they simply stay.
for (const face of faces) face.prepare().then(request, error => console.info('Card stays a photograph:', error.message));
