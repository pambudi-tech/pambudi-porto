import { paperTarget, advancePaper, paperContains, paperPlacementAt, PAPER_PLACEMENT } from './paper-motion.mjs';
import { PaperMaterial } from './paper-material.mjs';
import { PaperGL } from './paper-gl.mjs';
import { applyPaperPose } from './paper-pose.mjs';
import { isPaperTap, PAPER_FLIP } from './paper-flip.mjs';

const LIGHT = ['lx', 'ly', 'light'];
const clampUnit = value => Math.max(-1, Math.min(1, value));

export class PaperInteraction {
  constructor(element, { requestFrame, reduced = false, placementMirror, onTap } = {}) {
    this.element = element;
    this.image = element.querySelector('img') ?? element;
    this.requestFrame = requestFrame;
    this.placementMirror = placementMirror;
    this.onTap = onTap;
    this.state = { x: 0, y: 0, hovered: false, lit: false, pressed: false, reduced };
    this.current = paperTarget(this.state);
    this.target = { ...this.current };
    this.pointerId = null;
    this.moving = false;
    this.placementStarted = null;
    this.write();
    this.measure();
    this.ready = this.loadMask().catch(error => console.error('Paper outline:', error));
    // The light follows a mouse anywhere on the page, the works row included,
    // so it is already in place whenever the sheet comes back.
    addEventListener('pointermove', event => this.track(event.clientX, event.clientY, event.pointerType), { passive: true });
    document.addEventListener('mouseout', event => { if (!event.relatedTarget) this.dim(); });
  }
  async loadMask() {
    await this.image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 224;
    // The master's shape: with srcset, natural sizes are rounded per density.
    canvas.height = Math.round(224 * this.image.getAttribute('height') / this.image.getAttribute('width'));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(this.image, 0, 0, canvas.width, canvas.height);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    this.mask = { width: canvas.width, height: canvas.height, alpha };
    this.element.dataset.paperReady = 'true';
    this.measure();
    // The model's relief lit live; without WebGL 2, the photograph's own
    // relief layers as before, and the red back stays unlit as it was.
    try {
      const material = new PaperGL(this.image, 'white');
      await material.prepare();
      this.material = material;
    } catch (error) {
      console.warn('Paper lighting:', error);
      const material = new PaperMaterial(this.image);
      await material.prepare();
      this.material = material;
      return;
    }
    this.write();
    const back = this.element.querySelector('.paper-back .portfolio-frame');
    if (!back) return;
    const material = new PaperGL(back, 'red');
    await material.prepare().then(() => { this.backMaterial = material; this.write(); },
      error => console.warn('Paper lighting (back):', error));
  }
  measure() {
    // Measure the anchored layout rather than the moving perspective bounds.
    const parent = this.element.parentElement.getBoundingClientRect();
    const width = this.element.offsetWidth, height = this.element.offsetHeight;
    this.bounds = { left: parent.left + (parent.width - width) / 2, top: parent.top + (parent.height - height) / 2, width, height };
  }
  resize() { this.measure(); this.reset(); }
  contains(x, y) { return paperContains(this.bounds, this.mask, x, y); }
  ownsPointer(id) { return this.pointerId !== null && id === this.pointerId; }
  // The pointer's place over the sheet, -1 to 1 each way, held at its edges.
  point(x, y) {
    this.state.x = clampUnit((x - this.bounds.left) / this.bounds.width * 2 - 1);
    this.state.y = clampUnit((y - this.bounds.top) / this.bounds.height * 2 - 1);
  }
  track(x, y, type) {
    if (type === 'touch' || !this.bounds) return;
    this.state.lit = true;
    this.point(x, y);
    this.retarget();
  }
  dim() { this.state.lit = false; this.retarget(); }
  move(x, y, type = 'mouse') {
    if (this.flipping) return this.contains(x, y);
    if (this.pressOrigin && Math.hypot(x - this.pressOrigin.x, y - this.pressOrigin.y) > PAPER_FLIP.tapDistance) this.pressOrigin.dragged = true;
    const inside = this.contains(x, y);
    this.state.hovered = inside && type !== 'touch';
    if (inside) this.point(x, y);
    this.retarget();
    return inside;
  }
  press(event) {
    if (this.flipping) return;
    this.pressOrigin = { x: event.clientX, y: event.clientY, time: performance.now() };
    this.pointerId = event.pointerId;
    this.state.pressed = true;
    this.move(event.clientX, event.clientY, event.pointerType);
  }
  release(event) {
    if (!this.ownsPointer(event.pointerId)) return false;
    const tapped = isPaperTap(this.pressOrigin, event, performance.now()) && this.contains(event.clientX, event.clientY);
    this.pressOrigin = null;
    this.pointerId = null;
    this.state.pressed = false;
    if (event.type !== 'pointerup' || event.pointerType === 'touch') this.leave();
    else this.move(event.clientX, event.clientY, event.pointerType);
    if (tapped) this.onTap?.(event);
    return true;
  }
  leave() { this.state.hovered = false; this.retarget(); }
  // Lets go of the sheet; the light stays with the pointer.
  reset() {
    this.pressOrigin = null;
    this.pointerId = null;
    this.state.hovered = this.state.pressed = false;
    this.retarget();
  }
  setFlipping(flipping) {
    // Light both faces alike before a turn, so neither changes coming round.
    if (flipping && !this.flipping) this.relight();
    this.flipping = flipping;
    this.pressOrigin = null;
    this.pointerId = null;
    this.state.hovered = this.state.pressed = false;
    this.current = paperTarget(this.state);
    this.target = { ...this.current };
    this.moving = false;
    this.write();
  }
  setReducedMotion(reduced) {
    this.state.reduced = reduced;
    if (reduced) {
      this.placementStarted = null;
      this.placement = null;
      this.element.dataset.placement = 'complete';
    }
    this.retarget();
  }
  place(now = performance.now()) {
    this.mirrorActive = true;
    this.placementStarted = this.state.reduced ? null : now;
    this.placement = paperPlacementAt(0, this.state.reduced);
    this.element.dataset.placement = this.state.reduced ? 'complete' : 'placing';
    this.write();
    this.requestFrame?.();
  }
  // Draws both faces with the light as it is now: before a turn, and before
  // the works row hands the sheet back.
  relight() {
    this.material?.draw(this.current);
    this.backMaterial?.draw(this.current);
  }
  retarget() {
    const target = paperTarget(this.state);
    if (this.flipping) {
      // Turned away or turning: the light keeps up with the pointer unseen,
      // without animating or drawing.
      for (const key of LIGHT) this.current[key] = target[key];
      this.target = target;
      return;
    }
    if (Object.keys(target).some(key => target[key] !== this.target[key])) {
      this.target = target;
      this.moving = true;
      this.lastTime = null;
      if (this.state.reduced) { this.current = { ...target }; this.moving = false; }
      this.requestFrame?.();
    }
    this.write();
  }
  update(now) {
    const placing = this.placementStarted != null;
    if (!this.moving && !placing) return false;
    if (placing) {
      const progress = (now - this.placementStarted) / PAPER_PLACEMENT.duration;
      this.placement = paperPlacementAt(progress, this.state.reduced);
      if (progress >= 1) {
        this.placementStarted = null;
        this.placement = null;
        this.element.dataset.placement = 'complete';
      }
    }
    if (this.moving) {
      const elapsed = this.lastTime == null ? 16 : now - this.lastTime;
      this.lastTime = now;
      this.current = advancePaper(this.current, this.target, elapsed);
      this.moving = Object.keys(this.target).some(key => this.current[key] !== this.target[key]);
    }
    this.write();
    return this.moving || this.placementStarted != null;
  }
  write() {
    const values = applyPaperPose(this.element, this.current, this.placement);
    if (this.mirrorActive && this.placementMirror?.isConnected) {
      applyPaperPose(this.placementMirror, this.current, this.placement);
    }
    // Light only the face showing, and neither while it turns in 3D.
    if (!this.flipping) (this.element.dataset.paperSide === 'red' ? this.backMaterial : this.material)?.draw(values);
    const engaged = this.state.hovered || this.state.pressed;
    this.element.classList.toggle('paper-engaged', engaged || this.moving || this.placementStarted != null);
    document.body.classList.toggle('paper-hover', engaged);
    this.element.dataset.interaction = this.state.pressed ? 'pressed' : this.state.hovered ? 'hover' : this.moving ? 'settling' : 'rest';
  }
}
