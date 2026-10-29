import { buildWaxSurface, shadeWaxSurface } from './wax-material.mjs';
import { WaxEntrance } from './wax-entrance.mjs';
import { clamp } from '../shared/math.mjs';

export const WAX_LIGHT = Object.freeze({ reach: 100, fadeMs: 240, followMs: 110 });
const restLight = () => ({ x: 0, y: -.35, strength: 0 });

export function waxLightTarget(bounds, x, y) {
  if (!bounds.width || !bounds.height) return restLight();
  const rx = bounds.width / 2, ry = bounds.height / 2;
  const dx = x - bounds.left - rx, dy = y - bounds.top - ry;
  // Approximate distance to the oval, not the button's rectangular hit box.
  const radius = Math.hypot(dx / rx, dy / ry);
  const gradient = Math.hypot(dx / (rx * rx), dy / (ry * ry));
  const distance = gradient ? Math.max(0, radius * (radius - 1) / gradient) : 0;
  const amount = clamp(1 - distance / WAX_LIGHT.reach, 0, 1);
  return {
    x: clamp(dx / rx, -1, 1), y: clamp(dy / ry, -1, 1),
    strength: amount * amount * (3 - 2 * amount),
  };
}

export function advanceWaxLight(current, target, elapsed) {
  const dt = clamp(elapsed, 0, 50);
  return Object.fromEntries(Object.keys(target).map(key => {
    const duration = key === 'strength' ? WAX_LIGHT.fadeMs : WAX_LIGHT.followMs;
    const value = current[key] + (target[key] - current[key]) * (1 - Math.exp(-dt / duration));
    return [key, Math.abs(value - target[key]) < .001 ? target[key] : value];
  }));
}

export class WaxInteraction {
  // `entrance: false` skips the wax-flow entrance, for a seal that appears
  // some other way.
  constructor(element, motionPreference, { startWhen, entrance = true } = {}) {
    this.element = element;
    this.image = element.querySelector('img');
    this.motionPreference = motionPreference;
    this.entrance = entrance ? new WaxEntrance(element, motionPreference, { startWhen }) : null;
    this.current = restLight();
    this.target = restLight();
    this.frame = null;
    this.lastTime = null;
    const paper = element.closest('.portfolio-paper');
    const onBack = Boolean(element.closest('.paper-back'));
    this.suspended = onBack;
    paper?.addEventListener('paperflipstart', () => this.setSuspended(true));
    paper?.addEventListener('paperflipend', event => this.setSuspended(event.detail.red !== onBack));
    const move = event => {
      if (this.suspended) return;
      if (event.pointerType === 'touch') return;
      this.target = motionPreference.matches ? restLight()
        : waxLightTarget(this.image.getBoundingClientRect(), event.clientX, event.clientY);
      if (!this.target.strength && !this.current.strength) return;
      this.requestDraw();
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', () => this.resetLight());
    document.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') this.resetLight();
    }, { passive: true });
    window.addEventListener('blur', () => this.resetLight());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.resetLight();
    });
    element.addEventListener('focus', () => {
      if (element.matches(':focus-visible')) this.resetLight(true);
    });
    element.addEventListener('blur', () => this.resetLight());
    motionPreference.addEventListener('change', () => this.resetLight(element.matches(':focus-visible')));
    this.ready = Promise.all([
      this.entrance?.ready,
      this.prepare().catch(error => console.warn('Wax material:', error)),
    ]);
  }
  resetLight(focused = this.element.matches(':focus-visible')) {
    if (this.suspended) return;
    this.target = { ...restLight(), strength: focused ? 1 : 0 };
    this.requestDraw();
  }
  async prepare() {
    await this.image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.round(512 * this.image.naturalHeight / this.image.naturalWidth);
    canvas.className = 'wax-reflection';
    canvas.setAttribute('aria-hidden', 'true');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(this.image, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    this.surface = buildWaxSurface(imageData.data, canvas.width, canvas.height);
    this.pixels = context.createImageData(canvas.width, canvas.height);
    this.context = context;
    this.canvas = canvas;
    this.draw();
    this.image.after(canvas);
    this.element.dataset.waxReady = 'true';
    if (this.target.strength) this.requestDraw();
  }
  requestDraw() {
    if (this.suspended || !this.surface || this.frame !== null) return;
    this.frame = requestAnimationFrame(now => {
      this.frame = null;
      const elapsed = this.lastTime === null ? 16 : now - this.lastTime;
      this.lastTime = now;
      this.current = this.motionPreference.matches ? { ...this.target }
        : advanceWaxLight(this.current, this.target, elapsed);
      this.draw();
      if (Object.keys(this.target).some(key => this.current[key] !== this.target[key])) this.requestDraw();
      else this.lastTime = null;
    });
  }
  setSuspended(suspended) {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    if (suspended) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
      this.lastTime = null;
      this.current = restLight();
      this.target = restLight();
      if (this.surface) this.draw();
    } else this.resetLight();
  }
  draw() {
    const { x, y, strength } = this.current;
    const shadeKey = `${x.toFixed(3)},${y.toFixed(3)}`;
    if (shadeKey !== this.shadeKey) {
      shadeWaxSurface(this.surface, x, y, this.pixels.data);
      this.context.putImageData(this.pixels, 0, 0);
      this.shadeKey = shadeKey;
    }
    this.element.style.setProperty('--wax-light', strength.toFixed(4));
    // The lettering shares the material's light position and aspect ratio.
    // Raised edges face the light; their cast shadow points away from it.
    const lx = x * this.surface.width / this.surface.height;
    const ly = y;
    const length = Math.hypot(lx, ly, .7);
    const dx = lx / length, dy = ly / length;
    const base = { hx: -.6, hy: -.8, sx: .8, sy: 1.2, ax: 1.4, ay: 2 };
    for (const [name, value] of Object.entries({
      hx: dx * .9, hy: dy * .9,
      sx: -dx * 1.35, sy: -dy * 1.35,
      ax: -dx * 2, ay: -dy * 2,
    })) this.element.style.setProperty(`--wax-label-${name}`, `${(base[name] + (value - base[name]) * strength).toFixed(3)}px`);
    this.canvas.dataset.light = shadeKey;
    this.canvas.dataset.strength = strength.toFixed(4);
  }
}
