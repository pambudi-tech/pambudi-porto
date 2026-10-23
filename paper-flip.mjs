// Shared flip choreography. The hover/press pose stays on the outer wrapper;
// both complete paper faces travel together on the inner 3D turn.
export const PAPER_FLIP = Object.freeze({ duration: 880, lift: 12, depth: 32, rock: 1.4, tapDistance: 8, tapMs: 600 });

export function paperFlipDirection(x, bounds) {
  return x < bounds.left + bounds.width / 2 ? -1 : 1;
}

export function paperFlipPoseAt(progress, from, to) {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * t * (t * (t * 6 - 15) + 10);
  const lift = Math.sin(Math.PI * t) ** 2;
  return { angle: from + (to - from) * eased, y: -PAPER_FLIP.lift * lift,
    z: PAPER_FLIP.depth * lift, rx: -PAPER_FLIP.rock * lift };
}

export function paperFlipKeyframes(from, to) {
  // Sample the existing choreography once, then let the compositor interpolate
  // transforms without JavaScript, layout reads or style writes on each frame.
  return Array.from({ length: 61 }, (_, index) => {
    const offset = index / 60;
    const pose = paperFlipPoseAt(offset, from, to);
    return { offset, transform: `translate3d(0, ${pose.y}px, ${pose.z}px) rotateX(${pose.rx}deg) rotateY(${pose.angle}deg)` };
  });
}

export function isPaperTap(start, event, now) {
  return Boolean(start && event.type === 'pointerup' && now - start.time <= PAPER_FLIP.tapMs
    && !start.dragged && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= PAPER_FLIP.tapDistance);
}

export class PaperFlip {
  constructor(element, { reduced = false, onStart, onFinish } = {}) {
    this.element = element;
    this.turn = element.querySelector('.paper-turn');
    this.front = element.querySelector('.paper-front');
    this.back = element.querySelector('.paper-back');
    this.control = element.querySelector('.paper-flip-control');
    this.aboutLink = element.querySelector('.intro-link');
    this.reduced = reduced;
    this.onStart = onStart;
    this.onFinish = onFinish;
    this.angle = 0;
    this.red = false;
    this.active = false;
    this.syncFace(false);
    this.aboutLink.addEventListener('click', event => {
      event.preventDefault();
      if (this.active || this.red) return;
      this.focusAfterTurn = true;
      this.flip(1);
    });
    this.control.addEventListener('click', () => {
      if (this.active || !this.red) return;
      this.focusAfterTurn = true;
      this.flip(-1);
    });
    element.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !this.red || this.active) return;
      event.preventDefault();
      event.stopPropagation();
      this.focusAfterTurn = true;
      this.flip(-1);
    });
  }
  syncFace(red) {
    this.front.inert = red;
    this.back.inert = !red;
    this.front.setAttribute('aria-hidden', String(red));
    this.back.setAttribute('aria-hidden', String(!red));
    this.aboutLink?.setAttribute('aria-expanded', String(red));
    this.element.dataset.paperSide = red ? 'red' : 'white';
  }
  flipAt(x) { return this.flip(paperFlipDirection(x, this.element.getBoundingClientRect())); }
  flip(direction = 1) {
    if (this.active) return false;
    this.from = this.angle;
    this.to = this.angle + (direction < 0 ? -180 : 180);
    this.destinationRed = !this.red;
    if (this.reduced) { this.finish(); return true; }
    this.active = true;
    this.element.dataset.flipping = 'true';
    this.element.dispatchEvent(new CustomEvent('paperflipstart'));
    this.onStart?.();
    // Hide inactive controls from pointer/focus access throughout the turn.
    this.front.inert = this.back.inert = true;
    const animation = this.turn.animate(paperFlipKeyframes(this.from, this.to), {
      duration: PAPER_FLIP.duration, easing: 'linear', fill: 'both',
    });
    this.animation = animation;
    animation.finished.then(() => {
      if (this.animation === animation) this.finish();
    }).catch(() => {}); // Finishing early for reduced motion cancels the native animation.
    return true;
  }
  finish() {
    const animation = this.animation;
    this.animation = null;
    this.active = false;
    this.angle = this.to;
    this.red = this.destinationRed;
    this.turn.style.transform = `rotateY(${this.angle}deg)`;
    animation?.cancel();
    this.element.dataset.flipping = 'false';
    this.syncFace(this.red);
    if (this.focusAfterTurn) {
      this.focusAfterTurn = false;
      (this.red ? this.control : this.aboutLink)?.focus({ preventScroll: true });
    }
    this.onFinish?.();
    this.element.dispatchEvent(new CustomEvent('paperflipend', { detail: { red: this.red } }));
  }
  setReducedMotion(reduced) { this.reduced = reduced; if (reduced && this.active) this.finish(); }
}
