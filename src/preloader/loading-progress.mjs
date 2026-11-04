// The welcome is a true loader: it shows only while the page loads, its
// frame and title easing in (`fadeIn`, base.css), and leaves once loaded.
export const PRELOADER = Object.freeze({
  counterCatchup: 360, fadeIn: 600, exit: 320, resourceTimeout: 20000, longestFrame: 100,
});

// Count settled resources rather than bytes: images must be decoded, fonts
// loaded, and scene preparation finished.
export function loadingProgress(completed, total) {
  const resources = Math.max(0, Math.min(1, completed / Math.max(1, total)));
  return Math.floor(resources * 100);
}

// Ease the display toward completed work, never ahead of it: no progress is
// invented while requests are pending, and none is held back once done.
export class LoadingCounter {
  constructor(started) {
    this.started = started;
    this.from = this.target = this.value = 0;
    this.displayed = 0;
    this.duration = 0;
  }
  sample(now) {
    const t = this.duration ? Math.max(0, Math.min(1, (now - this.started) / this.duration)) : 1;
    const eased = t < .5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
    this.value = t === 1 ? this.target : this.from + (this.target - this.from) * eased;
    return this.value;
  }
  update(target, now) {
    this.sample(now);
    const next = Math.max(this.target, Math.min(100, target));
    if (next !== this.target) {
      this.from = this.value;
      this.target = next;
      this.started = now;
      this.duration = PRELOADER.counterCatchup;
    }
    this.displayed = Math.max(this.displayed, Math.floor(this.sample(now)));
    return this.displayed;
  }
}

// Only time the page is actually drawn counts toward the limit. Hidden tabs,
// and panes that are out of view without saying so, stop animation frames,
// and with them the entrances and image decoding the loader waits for. A
// long gap between frames counts as one short step.
export function settleWithin(task, milliseconds = PRELOADER.resourceTimeout, {
  requestFrame = globalThis.requestAnimationFrame, cancelFrame = globalThis.cancelAnimationFrame,
} = {}) {
  let frame, timer, elapsed = 0, last = null;
  const timeout = new Promise((_, reject) => {
    const fail = () => reject(new Error('Resource loading timed out'));
    if (!requestFrame) { timer = setTimeout(fail, milliseconds); return; }
    const tick = now => {
      if (last !== null) elapsed += Math.min(now - last, PRELOADER.longestFrame);
      last = now;
      if (elapsed >= milliseconds) fail();
      else frame = requestFrame(tick);
    };
    frame = requestFrame(tick);
  });
  return Promise.race([Promise.resolve(task), timeout]).finally(() => {
    clearTimeout(timer);
    cancelFrame?.(frame);
  });
}
