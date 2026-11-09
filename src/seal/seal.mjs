import { WaxGL, WAX_SEALS } from '../wax/wax-gl.mjs';
import { WAX_ASPECT } from '../wax/wax-layout.mjs';
import { WAX_REST, WAX_HOVER, waxFinish, lampInSeal, mixLamp, sealShadow } from '../wax/wax-light.mjs';
import { advanceWaxLight } from '../wax/wax-interaction.mjs';
import { pourAt } from '../wax/wax-pour.mjs';
import { clamp } from '../shared/math.mjs';

// One wax seal on its own, large: the plain button (seal.html) or the round
// P seal (p-seal.html), named by the button's data-seal. It pours as the page
// opens; a mouse anywhere on the page brings a close lamp over it; a press
// pours it again.

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const seal = document.querySelector('.seal');
const kind = seal.dataset.seal ?? 'button';
const { aspect: sealAspect } = WAX_SEALS[kind];
const wax = new WaxGL(seal.querySelector('.gl'), kind);
const rest = () => ({ x: WAX_REST.x, y: WAX_REST.y, strength: 0 });
// Between the room's light and the close lamp: its field the favicon's red.
const ROUND_REST = Object.freeze({ level: .9, sheen: .45, gloss: 85 });
let current = rest(), target = rest(), rect = null, pouring = null, seed = 0;

// Read on resize and scroll only, never while drawing.
const measure = () => { rect = seal.getBoundingClientRect(); };

function draw() {
  if (!rect?.height) return;
  const { width, height } = rect, aspect = width / height;
  // The resting lamp hangs as far off as it does over the button, whatever
  // the seal's shape: nearer, a round seal's field washes pink.
  const room = lampInSeal(WAX_REST, Math.max(aspect, WAX_ASPECT), 1);
  const light = mixLamp(room, lampInSeal(current, aspect, WAX_HOVER.lift), current.strength);
  const entrance = pouring === null ? {} : pourAt(performance.now() - pouring);
  // The round seal rests in a softer, farther light than the close lamp,
  // and takes the lamp's finish as the mouse comes; the button keeps the
  // close lamp's finish throughout.
  const finish = kind === 'round' ? waxFinish(ROUND_REST, current.strength) : WAX_HOVER;
  // Melted wax is glassy until it sets.
  const gloss = finish.gloss + (160 - finish.gloss) * (entrance.wet ?? 0);
  if (entrance.done) pouring = null;
  wax.draw({ width, height, level: finish.level, sheen: finish.sheen, extension: Math.max(0, aspect - sealAspect), light, gloss, ...entrance, seed });
  const [sx, sy] = sealShadow(light, height);
  seal.style.setProperty('--wax-shadow-x', `${sx.toFixed(2)}px`);
  seal.style.setProperty('--wax-shadow-y', `${sy.toFixed(2)}px`);
}

let frame = null, last = null;
function tick(now) {
  frame = null;
  const elapsed = last === null ? 16 : now - last;
  last = now;
  current = motion.matches ? { ...target } : advanceWaxLight(current, target, elapsed);
  draw();
  if (pouring !== null || Object.keys(target).some(key => current[key] !== target[key])) request();
  else last = null;
}
const request = () => { frame ??= requestAnimationFrame(tick); };

addEventListener('pointermove', event => {
  if (!rect || event.pointerType !== 'mouse') return;
  target = {
    x: clamp((event.clientX - rect.left - rect.width / 2) / (rect.width / 2), -1.6, 1.6),
    y: clamp((event.clientY - rect.top - rect.height / 2) / (rect.height / 2), -1.8, 1.8),
    strength: 1,
  };
  request();
}, { passive: true });
document.documentElement.addEventListener('mouseleave', () => {
  target = rest();
  request();
});

function pour() {
  if (motion.matches) return;
  pouring = performance.now();
  seed = Math.random() * 1000;
  request();
}
seal.addEventListener('click', pour);

new ResizeObserver(() => { measure(); request(); }).observe(seal);
measure();

// The photograph shows until the WebGL seal is ready; without WebGL 2 on a
// graphics card it simply stays.
wax.prepare().then(() => { measure(); pour(); draw(); seal.removeAttribute('data-waiting'); }, error => {
  seal.removeAttribute('data-waiting');
  console.info('Seal stays a photograph:', error.message);
});
