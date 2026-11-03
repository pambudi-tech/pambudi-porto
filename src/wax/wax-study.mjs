import { WaxGL, WAX_ASSETS } from './wax-gl.mjs';
import { waxLayout, WAX_ASPECT } from './wax-layout.mjs';
import { advanceWaxLight, waxLabelShadow } from './wax-interaction.mjs';
import { clamp } from '../shared/math.mjs';

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const panel = document.querySelector('.panel');
const seal = document.querySelector('.seal');
const label = seal.querySelector('.seal-label');
const input = document.querySelector('#label');
const sweep = document.querySelector('#sweep');
const measure = document.createElement('canvas').getContext('2d');
const settings = { lift: 1, depth: 1, gloss: 60, detail: 0 };
// At rest the light hangs above the seal's upper left, as in the photograph.
const rest = () => ({ x: -.55, y: -.9 });
let current = rest(), target = rest(), layout, frame = null, last = null, sweeping = false;
const model = new WaxGL(seal.querySelector('canvas'));

const sealHeight = () => Math.round(Math.min(150, Math.max(64, seal.parentElement.clientWidth / 4.4)));

function update() {
  const text = input.value.trim() || 'works';
  const height = sealHeight(), size = Math.round(height * .3);
  label.textContent = text;
  label.dataset.text = text;
  label.style.fontSize = `${size}px`;
  seal.setAttribute('aria-label', text);
  measure.font = getComputedStyle(label).font;
  const width = measure.measureText(text).width + text.length * size * .025;
  layout = waxLayout(width, { height, maxWidth: seal.parentElement.clientWidth });
  label.style.maxWidth = `${layout.labelWidth}px`;
  // Widen first, or the label wraps inside the previous width.
  seal.style.width = `${layout.width}px`;
  // Wrapped labels get extra height; very long ones also get smaller type.
  const maxHeight = layout.width / 1.3;
  let lines = label.getBoundingClientRect().height;
  for (let next = size - 1; lines > maxHeight * .52 && next >= 10; next--) {
    label.style.fontSize = `${next}px`;
    lines = label.getBoundingClientRect().height;
  }
  const fitted = Math.min(maxHeight, Math.max(height, lines / .52));
  layout = { ...layout, height: fitted, extension: layout.width / fitted - WAX_ASPECT };
  seal.style.height = `${fitted}px`;
  for (const button of document.querySelectorAll('[data-label]'))
    button.setAttribute('aria-pressed', String(button.dataset.label === text));
  draw();
}

// The ink is lit like the satin field it is pressed into (wax-gl.mjs): one
// lamp, wrapped diffuse and a soft gloss, measured against the resting light
// so that at rest the ink keeps its own red.
const INK = [183, 26, 32];
function fieldLight(across, lift, gloss) {
  const facing = lift / Math.hypot(across, lift);
  const diffuse = Math.max((facing + .25) / 1.25, 0);
  const nh = Math.sqrt((1 + facing) / 2);
  const shine = (nh ** (gloss * .545) * 1.7 * .3 + nh ** (gloss * .18) * .22) * Math.min(1, facing / .2) * .64;
  return { diffuse: .36 + .9 * diffuse, shine };
}
function labelFill(lightX, lightY, unit) {
  const lift = settings.lift * unit;
  const left = layout.width / 2 + lightX * unit - label.offsetLeft;
  const top = layout.height / 2 - lightY * unit - label.offsetTop;
  const home = rest(), aspect = layout.width / layout.height;
  const restAcross = Math.hypot(home.x * aspect / 2, home.y / 2) * unit;
  const resting = fieldLight(restAcross, lift, settings.gloss);
  const stops = [0, .25, .5, .8, 1.2, 1.8, 2.6, 4].map(step => {
    const { diffuse, shine } = fieldLight(step * unit, lift, settings.gloss);
    const gleam = 255 * Math.max(0, shine - resting.shine);
    const [r, g, b] = INK.map(value => Math.round(Math.min(255, value * diffuse / resting.diffuse + gleam)));
    return `rgb(${r} ${g} ${b}) ${Math.round(step * unit)}px`;
  });
  return `radial-gradient(circle at ${left.toFixed(1)}px ${top.toFixed(1)}px, ${stops.join(', ')})`;
}

// The light's x and y are measured in half-widths and half-heights of the
// seal, y down; the seal's space has y up and its height as the unit.
function draw() {
  const aspect = layout.width / layout.height;
  const light = [current.x * aspect / 2, -current.y / 2];
  model.draw({ ...layout, light: [...light, settings.lift],
    depth: settings.depth, gloss: settings.gloss, detail: settings.detail });
  const shadow = waxLabelShadow({ x: clamp(current.x, -1, 1), y: clamp(current.y, -1, 1), strength: 1 }, aspect);
  for (const [name, value] of Object.entries(shadow)) seal.style.setProperty(name, value);
  label.style.setProperty('--label-fill', labelFill(...light, layout.height));
}

function tick(now) {
  frame = null;
  const elapsed = last === null ? 16 : now - last;
  last = now;
  if (sweeping) {
    const t = now / 2400;
    target = { x: Math.cos(t) * 1.1, y: Math.sin(t) * 1.1 };
  }
  current = motion.matches ? { ...target } : advanceWaxLight(current, target, elapsed);
  draw();
  if (sweeping || Object.keys(target).some(key => current[key] !== target[key])) request();
  else last = null;
}
const request = () => { frame ??= requestAnimationFrame(tick); };

// The pointer anywhere on the stage is the light, a little beyond the seal too.
const move = event => {
  if (sweeping) return;
  const stage = seal.parentElement.getBoundingClientRect();
  const x = (event.clientX - stage.left - stage.width / 2) / (layout.width / 2);
  const y = (event.clientY - stage.top - stage.height / 2) / (layout.height / 2);
  target = { x: clamp(x, -1.6, 1.6), y: clamp(y, -1.8, 1.8) };
  request();
};
panel.addEventListener('pointermove', move);
panel.addEventListener('pointerdown', move);
panel.addEventListener('pointerleave', () => {
  if (sweeping) return;
  target = rest();
  request();
});

for (const button of document.querySelectorAll('[data-label]')) button.addEventListener('click', () => {
  input.value = button.dataset.label;
  update();
});
input.addEventListener('input', update);
sweep.addEventListener('click', () => {
  sweeping = !sweeping;
  sweep.setAttribute('aria-pressed', String(sweeping));
  if (!sweeping) target = rest();
  request();
});
for (const id of Object.keys(settings)) {
  const slider = document.getElementById(id), output = slider.nextElementSibling;
  slider.addEventListener('input', () => {
    settings[id] = Number(slider.value);
    output.value = id === 'gloss' ? slider.value : settings[id].toFixed(2);
    draw();
  });
}

const observer = new ResizeObserver(update);
observer.observe(panel);
update();

const status = text => { document.querySelector('[data-status]').textContent = text; };
const started = performance.now();
Promise.all([model.prepare(), document.fonts.ready]).then(async () => {
  const ms = Math.round(performance.now() - started);
  update();
  const sizes = await Promise.all(WAX_ASSETS.map(url => fetch(url).then(response => response.blob()).then(blob => blob.size)));
  status(`Ready in ${ms} ms · photo, colour and relief ${Math.round(sizes.reduce((sum, size) => sum + size, 0) / 1024)} KB`);
}, () => status('WebGL 2 is unavailable here; the photo is shown'));

addEventListener('pagehide', () => {
  observer.disconnect();
  cancelAnimationFrame(frame);
  model.dispose();
}, { once: true });
