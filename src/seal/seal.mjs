import { WaxGL } from '../wax/wax-gl.mjs';
import { WAX_ASPECT } from '../wax/wax-layout.mjs';
import { WAX_REST, WAX_HOVER, lampInSeal, mixLamp, sealShadow } from '../wax/wax-light.mjs';
import { advanceWaxLight } from '../wax/wax-interaction.mjs';
import { pourAt } from '../wax/wax-pour.mjs';
import { clamp } from '../shared/math.mjs';

// The wax button on its own, large and plain. It pours as the page opens; a
// mouse anywhere on the page brings a close lamp over it; a press pours it again.

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const seal = document.querySelector('.seal');
const wax = new WaxGL(seal.querySelector('.gl'));
const rest = () => ({ x: WAX_REST.x, y: WAX_REST.y, strength: 0 });
let current = rest(), target = rest(), rect = null, pouring = null, seed = 0;

// Read on resize and scroll only, never while drawing.
const measure = () => { rect = seal.getBoundingClientRect(); };

function draw() {
  if (!rect?.height) return;
  const { width, height } = rect, aspect = width / height;
  const room = lampInSeal(WAX_REST, aspect, 1);
  const light = mixLamp(room, lampInSeal(current, aspect, WAX_HOVER.lift), current.strength);
  const entrance = pouring === null ? {} : pourAt(performance.now() - pouring);
  // Melted wax is glassy until it sets.
  const gloss = WAX_HOVER.gloss + (160 - WAX_HOVER.gloss) * (entrance.wet ?? 0);
  if (entrance.done) pouring = null;
  wax.draw({ width, height, extension: Math.max(0, aspect - WAX_ASPECT), light, gloss, ...entrance, seed });
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
