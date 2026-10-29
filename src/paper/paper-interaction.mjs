import { paperTarget, advancePaper, paperContains, paperPlacementAt, PAPER_PLACEMENT } from './paper-motion.mjs';
import { PaperMaterial } from './paper-material.mjs';
import { applyPaperPose } from './paper-pose.mjs';
import { isPaperTap, PAPER_FLIP } from './paper-flip.mjs';

export class PaperInteraction {
  constructor(element, { requestFrame, reduced = false, placementMirror, onTap } = {}) {
    this.element = element;
    this.image = element.querySelector('img') ?? element;
    this.requestFrame = requestFrame;
    this.placementMirror = placementMirror;
    this.onTap = onTap;
    this.state = { x: 0, y: 0, hovered: false, pressed: false, reduced };
    this.current = paperTarget(this.state);
    this.target = { ...this.current };
    this.pointerId = null;
    this.moving = false;
    this.placementStarted = null;
    this.write();
    this.measure();
    this.ready = this.loadMask().catch(error => console.error('Paper outline:', error));
  }
  async loadMask() {
    await this.image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 224;
    canvas.height = Math.round(224 * this.image.naturalHeight / this.image.naturalWidth);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(this.image, 0, 0, canvas.width, canvas.height);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    this.mask = { width: canvas.width, height: canvas.height, alpha };
    this.element.dataset.paperReady = 'true';
    this.measure();
    const material = new PaperMaterial(this.image);
    material.prepare();
    material.draw(this.current);
    this.material = material;
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
  move(x, y, type = 'mouse') {
    if (this.flipping) return this.contains(x, y);
    if (this.pressOrigin && Math.hypot(x - this.pressOrigin.x, y - this.pressOrigin.y) > PAPER_FLIP.tapDistance) this.pressOrigin.dragged = true;
    const inside = this.contains(x, y);
    this.state.hovered = inside && type !== 'touch';
    if (inside) {
      this.state.x = Math.max(-1, Math.min(1, (x - this.bounds.left) / this.bounds.width * 2 - 1));
      this.state.y = Math.max(-1, Math.min(1, (y - this.bounds.top) / this.bounds.height * 2 - 1));
    }
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
  reset() {
    this.pressOrigin = null;
    this.pointerId = null;
    this.state.hovered = this.state.pressed = false;
    this.state.x = this.state.y = 0;
    this.retarget();
  }
  setFlipping(flipping) {
    this.flipping = flipping;
    this.pressOrigin = null;
    this.pointerId = null;
    this.state.hovered = this.state.pressed = false;
    this.state.x = this.state.y = 0;
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
  retarget() {
    const target = paperTarget(this.state);
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
    // Do not upload an invisible canvas while the red back is showing, or
    // repaint the white texture while its cached face is turning in 3D.
    if (!this.flipping && this.element.dataset.paperSide !== 'red') this.material?.draw(values);
    const engaged = this.state.hovered || this.state.pressed;
    this.element.classList.toggle('paper-engaged', engaged || this.moving || this.placementStarted != null);
    document.body.classList.toggle('paper-hover', engaged);
    this.element.dataset.interaction = this.state.pressed ? 'pressed' : this.state.hovered ? 'hover' : this.moving ? 'settling' : 'rest';
  }
}
