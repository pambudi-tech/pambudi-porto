import { WaxGL, WAX_ASSETS } from './wax-gl.mjs';
import { waxLayout, WAX_ASPECT } from './wax-layout.mjs';
import { advanceWaxLight, waxLabelShadow } from './wax-interaction.mjs';
import { WAX_REST, lampInSeal, labelFill } from './wax-light.mjs';
import { pourAt } from './wax-pour.mjs';
import { drawLetters } from './wax-letters.mjs';
import { clamp } from '../shared/math.mjs';

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const panel = document.querySelector('.panel');
const seal = document.querySelector('.seal');
const label = seal.querySelector('.seal-label');
const input = document.querySelector('#label');
const sweep = document.querySelector('#sweep');
const replay = document.querySelector('#replay');
const measure = document.createElement('canvas').getContext('2d');
const settings = { lift: 1, depth: 1, gloss: 60, detail: 0 };
const rest = () => ({ ...WAX_REST });
let current = rest(), target = rest(), layout, frame = null, last = null, sweeping = false, pouring = null, seed = 0;
const letters = document.createElement('canvas');
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
  // The label is pressed into the wax; the text stays for reading aloud.
  if (model.ready) {
    model.setLetters(drawLetters(letters, label, seal, Math.min(devicePixelRatio || 1, 2)));
    seal.dataset.letters = 'wax';
  }
  draw();
}

function draw() {
  const aspect = layout.width / layout.height;
  // While it pours, the parts of the entrance; afterwards, none. Melted wax
  // is glassy: its highlights tighten and brighten until it sets.
  const entrance = pouring === null ? null : pourAt(performance.now() - pouring);
  const light = lampInSeal(current, aspect, settings.lift);
  const wet = entrance?.wet ?? 0;
  model.draw({ ...layout, light, depth: settings.depth, detail: settings.detail,
    gloss: settings.gloss + (160 - settings.gloss) * wet, ...entrance, seed });
  if (entrance?.done) pouring = null;
  const shadow = waxLabelShadow({ x: clamp(current.x, -1, 1), y: clamp(current.y, -1, 1), strength: 1 }, aspect);
  for (const [name, value] of Object.entries(shadow)) seal.style.setProperty(name, value);
  label.style.setProperty('--label-fill', labelFill(light, lampInSeal(WAX_REST, aspect, settings.lift), {
    unit: layout.height, gloss: settings.gloss,
    centre: [layout.width / 2 - label.offsetLeft, layout.height / 2 - label.offsetTop] }));
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
  if (pouring !== null || sweeping || Object.keys(target).some(key => current[key] !== target[key])) request();
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

const play = () => {
  if (motion.matches) return;
  pouring = performance.now();
  seed = Math.random() * 1000;
  request();
};
replay.addEventListener('click', play);
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
  play();
  const sizes = await Promise.all(WAX_ASSETS.map(url => fetch(url).then(response => response.blob()).then(blob => blob.size)));
  status(`Ready in ${ms} ms · photo, colour and relief ${Math.round(sizes.reduce((sum, size) => sum + size, 0) / 1024)} KB`);
}, () => status('WebGL 2 is unavailable here; the photo is shown'));

addEventListener('pagehide', () => {
  observer.disconnect();
  cancelAnimationFrame(frame);
  model.dispose();
}, { once: true });
