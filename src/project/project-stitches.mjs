import { GRID } from '../stitch/model.mjs';
import { threadSprite } from '../stitch/render.mjs';
import { StitchEntrance } from '../stitch/stitch-entrance.mjs';
import { THREAD_COLORS } from '../stitch/thread-colors.mjs';
import { StitchUnpick } from '../stitch/stitch-unpick.mjs';

// How long, in ms, the project frame's stitches take to sweep in.
export const FRAME_SWEEP = 780;

// Project ornaments use the same partial-X sprites and entrance as the main
// embroidery. Their model stays fixed; only thread length changes over time.
export class ProjectStitches {
  constructor(canvas, { sweep = FRAME_SWEEP } = {}) {
    this.canvas = canvas;
    this.sprites = new Map();
    this.entrance = new StitchEntrance({ started: Infinity, sweep });
    this.cells = [];
    canvas.dataset.entrance = 'pending';
  }
  layout(cells, groups, dpr, scale) {
    Object.assign(this, { cells, groups, dpr, scale });
    this.entrance.plan(groups);
    this.paint(performance.now());
  }
  paint(now) {
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    let visible = 0;
    for (const cell of this.cells) {
      const progress = this.entrance.progress(cell.key, now) * (this.departure?.progress(cell.key, now) ?? 1);
      if (progress <= 0) continue;
      visible++;
      const sprite = threadSprite(this.sprites, THREAD_COLORS.red, cell.variation, progress);
      ctx.drawImage(sprite, cell.x - 5 * this.scale, cell.y - 5 * this.scale, (GRID + 10) * this.scale, (GRID + 10) * this.scale);
    }
    this.canvas.dataset.visibleStitches = String(visible);
    if (this.started) this.canvas.dataset.entrance = this.entrance.active(now) ? 'stitching' : 'complete';
    if (this.departure) this.canvas.dataset.departure = this.departure.active(now) ? 'unpick' : 'complete';
  }
  reveal() {
    if (this.started) return;
    this.started = true;
    this.entrance.started = performance.now();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.entrance.finish();
    const tick = now => {
      this.paint(now);
      if (this.canvas.isConnected && this.entrance.active(now)) requestAnimationFrame(tick);
    };
    tick(this.entrance.started);
  }
  unpick(started = performance.now()) {
    this.departure = new StitchUnpick(this.groups ?? [], { started, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches });
    const tick = now => {
      this.paint(now);
      if (this.canvas.isConnected && this.departure.active(now)) requestAnimationFrame(tick);
    };
    tick(started);
  }
}
