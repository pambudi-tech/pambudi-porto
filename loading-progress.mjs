export const PRELOADER = Object.freeze({
  minimum: 2000, counterCatchup: 360,
  finalSteps: Object.freeze({ 97: 100, 98: 180, 99: 300 }),
  completeHold: 120, exit: 320, welcomeDuration: 1000, paperDuration: 1400, resourceTimeout: 20000,
});

// Count settled resources rather than bytes: images must be decoded, fonts
// loaded, and scene preparation finished. The minimum display time never
// changes this percentage; it is a separate gate before revealing the page.
export function loadingProgress(completed, total) {
  const resources = Math.max(0, Math.min(1, completed / Math.max(1, total)));
  return Math.floor(resources * 100);
}

export const minimumElapsed = elapsed => elapsed >= PRELOADER.minimum;

// Animate the display toward completed work. Never invent new progress when
// requests are pending; cached work still gets a deliberate 0–100 entrance.
export class LoadingCounter {
  constructor(started) {
    this.origin = this.started = started;
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
      this.duration = Math.max(PRELOADER.counterCatchup, this.origin + PRELOADER.minimum - now);
    }
    const value = Math.floor(this.sample(now));
    if (value < 97) this.displayed = Math.max(this.displayed, value);
    else if (this.displayed < 97) {
      this.displayed = 97;
      this.finalStepAt = now;
    } else if (value > this.displayed && now - this.finalStepAt >= PRELOADER.finalSteps[this.displayed]) {
      this.displayed++;
      this.finalStepAt = now;
    }
    return this.displayed;
  }
}

// Hidden tabs throttle animation frames, which some loading steps wait for,
// so only time spent visible counts toward the limit.
export function settleWithin(task, milliseconds = PRELOADER.resourceTimeout, page = globalThis.document) {
  let timer = null, remaining = milliseconds, resumedAt = 0, onVisibility;
  const timeout = new Promise((_, reject) => {
    const run = () => {
      resumedAt = performance.now();
      timer = setTimeout(() => reject(new Error('Resource loading timed out')), Math.max(0, remaining));
    };
    onVisibility = () => {
      if (page.hidden && timer !== null) {
        clearTimeout(timer);
        timer = null;
        remaining -= performance.now() - resumedAt;
      } else if (!page.hidden && timer === null) run();
    };
    if (!page?.hidden) run();
    page?.addEventListener('visibilitychange', onVisibility);
  });
  return Promise.race([Promise.resolve(task), timeout]).finally(() => {
    clearTimeout(timer);
    page?.removeEventListener('visibilitychange', onVisibility);
  });
}
