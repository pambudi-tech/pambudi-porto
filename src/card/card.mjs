import { PaperGL } from '../paper/paper-gl.mjs';
import { paperTarget, advancePaper } from '../paper/paper-motion.mjs';
import { paperFlipKeyframes, paperFlipDirection, PAPER_FLIP } from '../paper/paper-flip.mjs';

// The card: the homepage's paper on its own. A mouse anywhere on the page
// brings the lamp to it; over the sheet it tilts; a tap turns it over.

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

function write() {
  paper.style.transform = `perspective(1200px) rotateX(${pose.rx.toFixed(3)}deg) rotateY(${pose.ry.toFixed(3)}deg) scale(${pose.scale.toFixed(5)})`;
  // Each face casts its own shadow; turned over, the back's runs the other way.
  sheets.forEach((sheet, i) => {
    sheet.style.setProperty('--sx', `${(i ? -pose.sx : pose.sx).toFixed(3)}px`);
    sheet.style.setProperty('--sy', `${pose.sy.toFixed(3)}px`);
    sheet.style.setProperty('--blur', `${pose.blur.toFixed(3)}px`);
    sheet.style.setProperty('--shadow', pose.opacity.toFixed(4));
  });
  // Turned round twice over, the back faces the viewer unmirrored: the same lamp.
  for (const face of faces) face.draw(pose);
}

let frame = null, last = null;
function tick(now) {
  frame = null;
  const elapsed = last === null ? 16 : now - last;
  last = now;
  const next = target();
  pose = advancePaper(pose, next, elapsed);
  write();
  if (Object.keys(next).some(key => pose[key] !== next[key])) request();
  else last = null;
}
const request = () => { frame ??= requestAnimationFrame(tick); };

function turnOver(direction) {
  if (turning) return;
  const from = angle, to = angle + 180 * direction;
  angle = ((to % 360) + 360) % 360;
  paper.setAttribute('aria-label', angle === 180 ? 'Turn the card to its front' : 'Turn the card to its back');
  request();
  if (motion.matches) { turn.style.transform = `rotateY(${angle}deg)`; return; }
  turning = turn.animate(paperFlipKeyframes(from, to), { duration: PAPER_FLIP.duration, fill: 'forwards' });
  turning.finished.then(() => {
    turn.style.transform = `rotateY(${angle}deg)`;
    turning.cancel();
    turning = null;
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

// Pressed, the sheet gives a little; a click turns it over, away from the
// side it was clicked on.
const release = () => { pointer.pressed = false; request(); };
paper.addEventListener('pointerdown', () => { pointer.pressed = true; request(); });
paper.addEventListener('pointerup', release);
paper.addEventListener('pointercancel', release);
paper.addEventListener('click', event => turnOver(paperFlipDirection(event.clientX, rect)));
paper.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  turnOver(1);
});

new ResizeObserver(() => { measure(); request(); }).observe(paper);
addEventListener('scroll', measure, { passive: true });
measure();
write();

// The photographs show until each WebGL face is ready; without WebGL 2 on a
// graphics card they simply stay.
for (const face of faces) face.prepare().then(request, error => console.info('Card stays a photograph:', error.message));
