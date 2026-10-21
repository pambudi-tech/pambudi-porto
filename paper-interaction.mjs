import { paperTarget, advancePaper, paperContains } from './paper-motion.mjs';

export class PaperInteraction {
  constructor(element, { requestFrame, reduced = false } = {}) {
    this.element = element;
    this.requestFrame = requestFrame;
    this.state = { x: 0, y: 0, hovered: false, pressed: false, reduced };
    this.current = paperTarget(this.state);
    this.target = { ...this.current };
    this.pointerId = null;
    this.moving = false;
    this.write();
    this.measure();
    this.loadMask().catch(error => console.error('Paper outline:', error));
  }
  async loadMask() {
    await this.element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 224;
    canvas.height = Math.round(224 * this.element.naturalHeight / this.element.naturalWidth);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(this.element, 0, 0, canvas.width, canvas.height);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    this.mask = { width: canvas.width, height: canvas.height, alpha };
    this.element.dataset.paperReady = 'true';
    this.measure();
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
    this.pointerId = event.pointerId;
    this.state.pressed = true;
    this.move(event.clientX, event.clientY, event.pointerType);
  }
  release(event) {
    if (!this.ownsPointer(event.pointerId)) return false;
    this.pointerId = null;
    this.state.pressed = false;
    if (event.type !== 'pointerup' || event.pointerType === 'touch') this.leave();
    else this.move(event.clientX, event.clientY, event.pointerType);
    return true;
  }
  leave() { this.state.hovered = false; this.retarget(); }
  reset() {
    this.pointerId = null;
    this.state.hovered = this.state.pressed = false;
    this.state.x = this.state.y = 0;
    this.retarget();
  }
  setReducedMotion(reduced) { this.state.reduced = reduced; this.retarget(); }
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
    if (!this.moving) return false;
    const elapsed = this.lastTime === null ? 16 : now - this.lastTime;
    this.lastTime = now;
    this.current = advancePaper(this.current, this.target, elapsed);
    this.moving = Object.keys(this.target).some(key => this.current[key] !== this.target[key]);
    this.write();
    return this.moving;
  }
  write() {
    const values = this.current;
    for (const key of ['rx', 'ry']) this.element.style.setProperty(`--paper-${key}`, `${values[key].toFixed(4)}deg`);
    for (const key of ['sx', 'sy', 'blur']) this.element.style.setProperty(`--paper-${key}`, `${values[key].toFixed(4)}px`);
    this.element.style.setProperty('--paper-scale', values.scale.toFixed(5));
    this.element.style.setProperty('--paper-shadow-opacity', values.opacity.toFixed(4));
    const engaged = this.state.hovered || this.state.pressed;
    this.element.classList.toggle('paper-engaged', engaged || this.moving);
    document.body.classList.toggle('paper-hover', engaged);
    this.element.dataset.interaction = this.state.pressed ? 'pressed' : this.state.hovered ? 'hover' : this.moving ? 'settling' : 'rest';
  }
}
