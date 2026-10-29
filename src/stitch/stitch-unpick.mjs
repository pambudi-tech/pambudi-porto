// Motifs and page departures retract the same two-pass thread geometry.
export const UNPICK_STITCH = 280;
export const BRAND_UNPICK_SWEEP = 620;

export class StitchUnpick {
  constructor(groups, { started = 0, sweep = BRAND_UNPICK_SWEEP, reduced = false } = {}) {
    Object.assign(this, { started, sweep, reduced });
    this.offsets = new Map();
    for (const keys of groups) [...keys].reverse().forEach((key, index) => {
      this.offsets.set(key, index / Math.max(1, keys.length - 1) * sweep);
    });
  }
  progress(key, now) {
    if (!this.offsets.has(key)) return 1;
    if (this.reduced) return this.reversing ? 1 : 0;
    if (this.reversing) return Math.max(0, Math.min(1, (now - this.started - (this.sweep - this.offsets.get(key))) / UNPICK_STITCH));
    return 1 - Math.max(0, Math.min(1, (now - this.started - this.offsets.get(key)) / UNPICK_STITCH));
  }
  active(now) { return !this.reduced && now < this.started + this.sweep + UNPICK_STITCH; }
  reverse(started) { this.started = started; this.reversing = true; }
}
