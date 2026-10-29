// Shared timing for the dot-matrix departure-board transition, in milliseconds.
export const DEPARTURE_MOTION = Object.freeze({
  leave: 80, leaveStagger: 3, maxLeaveStagger: 40,
  roll: 240, stagger: 13, step: 36,
});

const LETTERS = 'ABCDEFGHIJKLNOPQRSTUVXYZ'; // Three-column letters fit every letter slot.
const cycle = (slot, index, step) => {
  if (slot.char === ':' || slot.char === '%') return slot.char;
  const alphabet = /\d/.test(slot.char) ? '0123456789' : LETTERS;
  return alphabet[(index * 7 + step + 1) % alphabet.length];
};
const visible = slots => slots.filter(slot => slot.char !== ' ');

export class DepartureBoard {
  constructor() {
    this.current = [];
    this.target = [];
    this.active = false;
  }
  finish(slots = this.target) {
    this.current = slots;
    this.target = slots;
    this.active = false;
  }
  transitionTo(slots, now, immediate = false) {
    if (immediate) { this.finish(slots); return; }
    // Retarget from the displayed glyphs, so quick hover changes never flash
    // the previous completed phrase or leave an old completion queued up.
    this.from = visible(this.sample(now));
    this.target = slots;
    this.started = now;
    this.leaveStagger = Math.min(DEPARTURE_MOTION.leaveStagger,
      DEPARTURE_MOTION.maxLeaveStagger / Math.max(1, this.from.length - 1));
    this.leaveDuration = this.from.length
      ? DEPARTURE_MOTION.leave + this.leaveStagger * (this.from.length - 1) : 0;
    this.active = true;
  }
  refreshTarget(slots) {
    // A seconds tick during the return animation updates its destination
    // without restarting the stagger or extending the transition.
    this.target = slots;
    if (!this.active) this.current = slots;
  }
  sample(now) {
    if (!this.active) return this.current;
    const elapsed = Math.max(0, now - this.started);
    const incoming = visible(this.target);
    const end = this.leaveDuration + DEPARTURE_MOTION.roll
      + Math.max(0, incoming.length - 1) * DEPARTURE_MOTION.stagger;
    if (elapsed >= end) { this.finish(); return this.current; }
    if (elapsed < this.leaveDuration) {
      return this.from.flatMap((slot, index) => {
        const local = elapsed - index * this.leaveStagger;
        if (local >= DEPARTURE_MOTION.leave) return [];
        const char = local < DEPARTURE_MOTION.step ? slot.char
          : cycle(slot, index, Math.floor(local / DEPARTURE_MOTION.step));
        return [{ ...slot, char }];
      });
    }
    return incoming.flatMap((slot, index) => {
      const local = elapsed - this.leaveDuration - index * DEPARTURE_MOTION.stagger;
      if (local < 0) return [];
      const char = local >= DEPARTURE_MOTION.roll ? slot.char
        : cycle(slot, index, Math.floor(local / DEPARTURE_MOTION.step));
      return [{ ...slot, char }];
    });
  }
}
