import { INK_ENTRANCE } from './paper-ink.mjs';

export const WAX_ENTRANCE = Object.freeze({
  ...INK_ENTRANCE, points: 192,
  // Start the original soft label reveal while the outer rim is still flowing.
  labelAt: .5,
});
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function waxFlowAt(progress) {
  const t = clamp(progress);
  // A damped flow: gather briefly, release into a quicker spread, then lose
  // momentum over a long tail. No constant-speed wipe or spring bounce.
  return (1 - (1 + 6 * t) * Math.exp(-6 * t)) / (1 - 7 * Math.exp(-6));
}

// A growing liquid front, independent of the button's layout and press transform.
export function waxSpreadAt(progress, width, height) {
  const time = clamp(progress);
  const t = waxFlowAt(time);
  const seed = height * .025;
  const points = Array.from({ length: WAX_ENTRANCE.points }, (_, i) => {
    const angle = i / WAX_ENTRANCE.points * Math.PI * 2;
    // Slightly different flow speeds produce soft, asymmetric scallops.
    // Fixed angular speeds keep every part advancing instead of wobbling back.
    const uneven = (.9 * Math.sin(angle * 3 + .7)
      + .65 * Math.sin(angle * 5 - 1.2) + .4 * Math.sin(angle * 9 + 2)) / 1.95;
    const resistance = Math.exp(uneven * .38);
    const rx = seed + (width * .57 - seed) * smooth(t) ** resistance;
    const ry = seed + (height * .63 - seed) * smooth(t * 1.25) ** resistance;
    return [width / 2 + Math.cos(angle) * rx,
      height / 2 + Math.sin(angle) * ry];
  });
  return { points, opacity: smooth(time / .07), edge: smooth(t / .08) * (1 - smooth((t - .65) / .28)),
    label: smooth((t - WAX_ENTRANCE.labelAt) / .33) };
}

function liquidPath(context, points) {
  context.beginPath();
  const last = points.at(-1), first = points[0];
  context.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
  points.forEach((point, i) => {
    const next = points[(i + 1) % points.length];
    context.quadraticCurveTo(point[0], point[1], (point[0] + next[0]) / 2, (point[1] + next[1]) / 2);
  });
  context.closePath();
}

export function drawWaxSpread(context, image, progress, mask) {
  const { width, height } = context.canvas;
  const front = waxSpreadAt(progress, width, height);
  const maskContext = mask.getContext('2d');
  maskContext.clearRect(0, 0, width, height);
  maskContext.save();
  // Two feathered densities form a translucent leading edge. The dense
  // core stays behind it; nothing strokes an opaque outline onto the wax.
  maskContext.filter = `blur(${.7 + front.edge * width * .019}px)`;
  maskContext.globalAlpha = .45;
  maskContext.fillStyle = '#fff';
  liquidPath(maskContext, front.points); maskContext.fill();
  maskContext.filter = `blur(${.6 + front.edge * width * .0047}px)`;
  maskContext.globalAlpha = 1;
  const core = front.points.map(([x, y]) => [
    width / 2 + (x - width / 2) * (1 - front.edge * .06),
    height / 2 + (y - height / 2) * (1 - front.edge * .06),
  ]);
  liquidPath(maskContext, core); maskContext.fill();
  maskContext.restore();

  context.clearRect(0, 0, width, height);
  context.save();
  context.globalAlpha = front.opacity;
  context.drawImage(image, 0, 0, width, height);
  context.globalCompositeOperation = 'destination-in';
  context.globalAlpha = 1;
  context.drawImage(mask, 0, 0);
  context.restore();
  return front;
}

export class WaxEntrance {
  constructor(element, motionPreference) {
    this.element = element;
    this.image = element.querySelector('img');
    this.frame = null;
    this.done = false;
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    this.finish = this.finish.bind(this);
    if (motionPreference.matches) { this.finish(); return; }
    element.classList.add('wax-entering');
    element.dataset.waxEntrance = 'preparing';
    element.addEventListener('pointerdown', this.finish, options);
    element.addEventListener('focus', this.finish, options);
    window.addEventListener('resize', this.finish, options);
    motionPreference.addEventListener('change', event => { if (event.matches) this.finish(); }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.finish(); }, options);
    this.prepare().catch(() => this.finish());
  }
  async prepare() {
    await Promise.all([this.image.decode(), document.fonts.ready]);
    if (this.done) return;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wax-spread';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.width = 768;
    this.canvas.height = Math.round(768 * this.image.naturalHeight / this.image.naturalWidth);
    this.mask = document.createElement('canvas');
    this.mask.width = this.canvas.width; this.mask.height = this.canvas.height;
    const context = this.canvas.getContext('2d');
    this.image.after(this.canvas);
    const started = performance.now() + WAX_ENTRANCE.delay;
    const tick = now => {
      const progress = clamp((now - started) / WAX_ENTRANCE.duration);
      if (progress >= 1) { this.finish(); return; }
      const state = drawWaxSpread(context, this.image, progress, this.mask);
      this.element.dataset.waxEntrance = 'spreading';
      this.element.dataset.waxSpread = progress.toFixed(3);
      this.element.style.setProperty('--wax-label-reveal', state.label.toFixed(4));
      this.element.style.setProperty('--wax-label-softness', `${((1 - state.label) * .7).toFixed(3)}px`);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  finish() {
    this.done = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.events.abort();
    this.canvas?.remove();
    this.element.classList.remove('wax-entering');
    this.element.style.removeProperty('--wax-label-reveal');
    this.element.style.removeProperty('--wax-label-softness');
    delete this.element.dataset.waxSpread;
    this.element.dataset.waxEntrance = 'complete';
  }
}
