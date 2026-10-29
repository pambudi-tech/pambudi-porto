// Wait to distinguish a tap, a drag, and a hold before adding any stitches.
export class TouchHold {
  constructor(onHold, { delay = 500, distance = 8, schedule = setTimeout, cancel = clearTimeout } = {}) {
    Object.assign(this, { onHold, delay, distance, schedule, clearTimer: cancel });
    this.pending = null;
  }
  begin(id, x, y) {
    this.cancel();
    const start = { id, x, y };
    this.pending = start;
    this.timer = this.schedule(() => {
      if (this.pending !== start) return;
      this.pending = null;
      this.timer = null;
      this.onHold(start);
    }, this.delay);
  }
  has(id) { return this.pending?.id === id; }
  move(id, x, y) {
    if (!this.has(id) || Math.hypot(x - this.pending.x, y - this.pending.y) < this.distance) return null;
    return this.take(id);
  }
  take(id) {
    if (!this.has(id)) return null;
    const start = this.pending;
    this.cancel();
    return start;
  }
  cancel() {
    if (this.timer != null) this.clearTimer(this.timer);
    this.pending = null;
    this.timer = null;
  }
}
