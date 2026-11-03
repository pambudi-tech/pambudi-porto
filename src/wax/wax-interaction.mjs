import { buildWaxSurface, shadeWaxSurface } from './wax-material.mjs';
import { WaxEntrance } from './wax-entrance.mjs';
import { WAX_ASPECT } from './wax-layout.mjs';
import { WAX_REST, WAX_ROOM, WAX_HOVER, lampInSeal, mixLamp, waxFinish, paperLampInSeal, sealShadow } from './wax-light.mjs';
// The relit wax is fetched only once the page has settled, so it adds
// nothing before the first paint.
const relitModules = () => Promise.all([import('./wax-gl.mjs'), import('./wax-pour.mjs'), import('./wax-letters.mjs')]);
import { clamp } from '../shared/math.mjs';
import { offMainThread } from '../shared/prep.mjs';

export const WAX_LIGHT = Object.freeze({ reach: 100, fadeMs: 240, followMs: 110 });
const restLight = () => ({ x: 0, y: -.35, strength: 0 });
const REST_SHADE = `${(0).toFixed(3)},${(-.35).toFixed(3)}`;
const idle = () => new Promise(resolve => (window.requestIdleCallback
  ? requestIdleCallback(resolve, { timeout: 2000 }) : setTimeout(resolve, 200)));

// The front and back seals share one image, so they share its relief and
// its resting light rather than each building them.
const surfaces = new Map();
function waxSurfaceFor(image, width, height) {
  const key = `${image.currentSrc || image.src} ${width}x${height}`;
  if (!surfaces.has(key)) {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    context.canvas.width = width;
    context.canvas.height = height;
    context.drawImage(image, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    surfaces.set(key, offMainThread('wax', { rgba, width, height }, () => buildWaxSurface(rgba, width, height)));
  }
  return surfaces.get(key);
}

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

// The lettering shares the material's light position and aspect ratio.
// Raised edges face the light; their cast shadow points away from it.
export function waxLabelShadow({ x, y, strength }, aspect) {
  const lx = x * aspect;
  const ly = y;
  const length = Math.hypot(lx, ly, .7);
  const dx = lx / length, dy = ly / length;
  const base = { hx: -.6, hy: -.8, sx: .8, sy: 1.2, ax: 1.4, ay: 2 };
  return Object.fromEntries(Object.entries({
    hx: dx * .9, hy: dy * .9,
    sx: -dx * 1.35, sy: -dy * 1.35,
    ax: -dx * 2, ay: -dy * 2,
  }).map(([name, value]) => [`--wax-label-${name}`, `${(base[name] + (value - base[name]) * strength).toFixed(3)}px`]));
}

export class WaxInteraction {
  // `entrance: false` skips the wax-flow entrance, for a seal that appears
  // some other way. `relit` lights the wax itself in WebGL, where it can.
  constructor(element, motionPreference, { startWhen, entrance = true, relit = false } = {}) {
    this.element = element;
    this.image = element.querySelector('img');
    this.label = element.querySelector('.works-seal-label');
    this.motionPreference = motionPreference;
    this.relit = relit;
    // Relit in time, the seal pours as wax instead of the flat entrance;
    // otherwise that entrance spreads whatever is drawn by then.
    this.relitSettled = new Promise(resolve => { this.settleRelit = resolve; });
    this.entrance = entrance ? new WaxEntrance(element, motionPreference, {
      startWhen, waitFor: this.relitSettled,
      source: () => (this.view ? this.canvas : null), instead: () => this.pour(),
    }) : null;
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
    // The relit wax; without WebGL 2, the photograph's own relief as before.
    if (this.relit) {
      try { await this.prepareRelit(); return; } catch (error) { console.warn('Wax lighting:', error); } finally { this.settleRelit(); }
    }
    this.settleRelit();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.round(512 * this.image.naturalHeight / this.image.naturalWidth);
    canvas.className = 'wax-reflection';
    canvas.setAttribute('aria-hidden', 'true');
    const context = canvas.getContext('2d');
    this.surface = await waxSurfaceFor(this.image, canvas.width, canvas.height);
    this.pixels = context.createImageData(canvas.width, canvas.height);
    this.context = context;
    this.canvas = canvas;
    this.draw();
    this.image.after(canvas);
    this.element.dataset.waxReady = 'true';
    if (this.target.strength) this.requestDraw();
  }
  async prepareRelit() {
    // After the page has settled: nothing here may hold up its first paint.
    await idle();
    const [{ WaxGL }, { pourAt }, { drawLetters }] = await relitModules();
    this.pourAt = pourAt;
    this.drawLetters = drawLetters;
    const canvas = document.createElement('canvas');
    canvas.className = 'wax-gl';
    canvas.setAttribute('aria-hidden', 'true');
    const view = new WaxGL(canvas);
    await view.prepare();
    this.view = view;
    this.canvas = canvas;
    // The letters are pressed in the label's own face: pressed before it has
    // loaded, they would take a stand-in's shapes and places.
    if (this.label) {
      const font = getComputedStyle(this.label);
      await document.fonts.load(`${font.fontWeight} ${font.fontSize} ${font.fontFamily}`).catch(() => {});
      document.fonts.addEventListener('loadingdone', () => { this.pressLetters(); this.draw(); });
    }
    this.letters = document.createElement('canvas');
    this.pressLetters();
    // Pressed afresh whenever the seal or its label changes size, a label's
    // font arriving after the seal is laid out included ("details" takes the
    // homepage seal's): a stale press would sit off the label's place.
    const resized = new ResizeObserver(() => { this.measured = null; this.pressLetters(); this.draw(); });
    resized.observe(this.element);
    if (this.label) resized.observe(this.label);
    // A label that changes its words ("gallery", "back") is pressed afresh.
    if (this.label) new MutationObserver(() => { this.pressLetters(); this.draw(); })
      .observe(this.label, { childList: true, characterData: true, subtree: true });
    this.draw();
    this.image.after(canvas);
    // Settle its hidden style first, so it fades in over the photograph,
    // which then steps aside: their soft edges would otherwise double.
    getComputedStyle(canvas).opacity;
    this.element.dataset.waxRelit = 'fading';
    const settle = () => { this.element.dataset.waxRelit = 'settled'; };
    // Under the welcome there is no fade (base.css), so nothing to wait for.
    if (document.body.classList.contains('is-loading')) settle();
    canvas.addEventListener('transitionend', settle, { once: true });
    setTimeout(settle, 600);
    this.element.dataset.waxReady = 'true';
    if (this.target.strength) this.requestDraw();
  }
  // The label is pressed into the wax, lit with it; its text stays for
  // reading aloud.
  pressLetters() {
    if (!this.label || !this.element.offsetWidth) return;
    this.view.setLetters(this.drawLetters(this.letters, this.label, this.element, Math.min(devicePixelRatio || 1, 2)));
    this.element.dataset.waxLetters = 'pressed';
    this.drawn = null;
  }
  // Pours the seal as wax (wax-pour.mjs), a new puddle each time; false when
  // it cannot, and the flat entrance plays instead. A seal on the face turned
  // away is simply there when the paper turns.
  pour() {
    if (this.settled) return true;
    if (!this.view || this.motionPreference.matches) return false;
    if (this.element.closest('.paper-face')?.getAttribute('aria-hidden') !== 'true') {
      this.pouring = { start: performance.now(), seed: Math.random() * 1000 };
      // Its first, empty frame now: the formed seal must not show first.
      this.draw();
      this.element.dataset.waxPour = 'pouring';
      this.requestDraw();
    }
    return true;
  }
  // The seal as it rests, its entrance skipped or cut short, the pour too:
  // for a page taking another's place, whose seal was already there.
  settle() {
    this.settled = true;
    this.entrance?.finish();
    if (!this.pouring) return;
    this.pouring = null;
    this.element.dataset.waxPour = 'set';
    this.drawn = null;
    this.draw();
  }
  // The paper's lamp, now and at rest (paper-gl.mjs lightPosition), for a
  // seal on the paper: it lights the seal as it lights the sheet.
  followPaper(lamp, rest) {
    this.paperLight = { lamp, rest };
    if (this.view && !this.suspended) this.draw();
  }
  // Where the seal sits on its sheet, and its label within it; read once and
  // again on resize, never while drawing.
  measure() {
    const width = this.image.offsetWidth, height = this.image.offsetHeight;
    const frame = this.element.closest('.paper-face')?.querySelector('.portfolio-frame');
    let paper = null;
    if (frame) {
      const sheet = frame.getBoundingClientRect(), seal = this.image.getBoundingClientRect();
      if (sheet.height) paper = {
        x: (seal.left + seal.width / 2 - sheet.left - sheet.width / 2) / sheet.height,
        y: (seal.top + seal.height / 2 - sheet.top - sheet.height / 2) / sheet.height,
        height: seal.height / sheet.height,
      };
    }
    this.measured = { width, height, paper };
    return this.measured;
  }
  requestDraw() {
    if (this.suspended || !(this.surface || this.view) || this.frame !== null) return;
    this.frame = requestAnimationFrame(now => {
      this.frame = null;
      const elapsed = this.lastTime === null ? 16 : now - this.lastTime;
      this.lastTime = now;
      this.current = this.motionPreference.matches ? { ...this.target }
        : advanceWaxLight(this.current, this.target, elapsed);
      this.draw();
      if (this.pouring || Object.keys(this.target).some(key => this.current[key] !== this.target[key])) this.requestDraw();
      else this.lastTime = null;
    });
  }
  // Turned away or turning, the seal rests as at first: no hover or press
  // shows on it (base.css), so none is there as the paper comes back.
  setSuspended(suspended) {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.element.toggleAttribute('data-wax-away', suspended);
    if (suspended) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
      this.lastTime = null;
      this.current = restLight();
      this.target = restLight();
      if (this.surface || this.view) this.draw();
    } else {
      // Measured afresh as its face comes round: turned away, it may not be.
      this.measured = null;
      this.resetLight();
    }
  }
  // The lamp is the room's (the paper's, or a default above the upper left)
  // until a pointer comes near: then a close lamp comes down over it, and the
  // wax takes on its full gloss.
  drawRelit() {
    const { width, height, paper } = this.measured ?? this.measure();
    if (!width || !height) return;
    const aspect = width / height, strength = this.current.strength;
    const onPaper = this.paperLight && paper;
    // Turned away, it is drawn as it rests, so it always comes round looking
    // as it did when the page opened, not as it was when the paper turned.
    const room = onPaper ? paperLampInSeal(this.suspended ? this.paperLight.rest : this.paperLight.lamp, paper)
      : lampInSeal(WAX_REST, aspect, 1);
    const lamp = mixLamp(room, lampInSeal(this.current, aspect, WAX_HOVER.lift), strength);
    const finish = waxFinish(onPaper ? WAX_ROOM : WAX_HOVER, strength);
    // While it pours, the entrance's parts; melted wax is glassy until it sets.
    const since = this.pouring ? performance.now() - this.pouring.start : null;
    const entrance = since === null ? {} : this.pourAt(since);
    if (entrance.done) {
      this.pouring = null;
      this.element.dataset.waxPour = 'set';
    }
    if (since !== null) finish.gloss += (160 - finish.gloss) * entrance.wet;
    const key = [...lamp, finish.level, width, height, since ?? -1].map(value => value.toFixed(4)).join();
    if (key === this.drawn) return;
    this.drawn = key;
    this.view.draw({ width, height, extension: Math.max(0, aspect - WAX_ASPECT), light: lamp, ...finish,
      ...entrance, seed: this.pouring?.seed ?? 0 });
    const [sx, sy] = sealShadow(lamp, height);
    this.element.style.setProperty('--wax-shadow-x', `${sx.toFixed(2)}px`);
    this.element.style.setProperty('--wax-shadow-y', `${sy.toFixed(2)}px`);
  }
  draw() {
    if (this.view) { this.drawRelit(); return; }
    const { x, y, strength } = this.current;
    const shadeKey = `${x.toFixed(3)},${y.toFixed(3)}`;
    if (shadeKey !== this.shadeKey) {
      const resting = shadeKey === REST_SHADE;
      if (resting && this.surface.resting) this.pixels.data.set(this.surface.resting);
      else {
        shadeWaxSurface(this.surface, x, y, this.pixels.data);
        if (resting) this.surface.resting = this.pixels.data.slice();
      }
      this.context.putImageData(this.pixels, 0, 0);
      this.shadeKey = shadeKey;
    }
    this.element.style.setProperty('--wax-light', strength.toFixed(4));
    for (const [name, value] of Object.entries(waxLabelShadow(this.current, this.surface.width / this.surface.height)))
      this.element.style.setProperty(name, value);
    this.canvas.dataset.light = shadeKey;
    this.canvas.dataset.strength = strength.toFixed(4);
  }
}
