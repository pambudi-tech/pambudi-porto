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
    this.reduced = reduced;
    this.onStart = onStart;
    this.onFinish = onFinish;
    this.angle = 0;
    this.red = false;
    this.active = false;
    this.syncFace(false);
    this.control.addEventListener('click', () => this.flip(1));
    this.control.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
      event.stopPropagation();
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        if (!event.repeat) this.flip(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (event.repeat) event.preventDefault();
    });
    // A simple click on the text also turns the paper. Native text selection
    // and existing links/buttons keep their own interactions.
    const copy = element.querySelector('.paper-copy');
    copy.addEventListener('pointerdown', event => {
      this.copyTap = event.button === 0 ? { x: event.clientX, y: event.clientY, time: performance.now() } : null;
    });
    copy.addEventListener('pointermove', event => {
      if (this.copyTap && Math.hypot(event.clientX - this.copyTap.x, event.clientY - this.copyTap.y) > PAPER_FLIP.tapDistance) this.copyTap.dragged = true;
    });
    copy.addEventListener('pointercancel', () => { this.copyTap = null; });
    copy.addEventListener('click', event => {
      const start = this.copyTap;
      this.copyTap = null;
      if (event.target.closest('a, button') || !document.getSelection()?.isCollapsed) return;
      if (isPaperTap(start, { ...event, type: 'pointerup', clientX: event.clientX, clientY: event.clientY }, performance.now())) this.flipAt(event.clientX);
    });
  }
  syncFace(red) {
    this.front.inert = red;
    this.back.inert = !red;
    this.front.setAttribute('aria-hidden', String(red));
    this.back.setAttribute('aria-hidden', String(!red));
    this.control.setAttribute('aria-label', `Flip paper to ${red ? 'white' : 'red'}`);
    this.control.setAttribute('aria-pressed', String(red));
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
    this.onFinish?.();
    this.element.dispatchEvent(new CustomEvent('paperflipend', { detail: { red: this.red } }));
  }
  setReducedMotion(reduced) { this.reduced = reduced; if (reduced && this.active) this.finish(); }
}
