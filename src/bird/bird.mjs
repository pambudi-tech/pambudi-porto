import { BIRD_COLUMNS, BIRD_ROWS, BIRD_COLOR, BIRD_FRAME_MS } from './bird-data.mjs';
import { GRID, surfaceSpacing, keyOf } from '../stitch/model.mjs';
import { StitchEntrance, ENTRANCE, flameEntranceOrder } from '../stitch/stitch-entrance.mjs';
import { articulatePose, BODY_FRAME_MS } from './bird-motion.mjs';
import { WING_POSES } from './wing-motion.mjs';
import { FlightPath, FLIGHT } from './flight-path.mjs';

const REVEAL_DURATION = ENTRANCE.delay + ENTRANCE.wordmark + ENTRANCE.stitch;
// About two thirds of the source chart, leaving room to wander around the paper.
export const FIGURE_SCALE = .66;
// Pitch changes re-sample the figure only once they move it by about half a stitch.
const PITCH_STEP = .02;

// Area sampling preserves the outline at the surface's actual stitch spacing.
// No sub-grid stitches or scaled bird image are needed.
export function samplePose(pose, columns, rows) {
  const sx = columns / (BIRD_COLUMNS + 4), sy = rows / (BIRD_ROWS + 4);
  const coverage = new Map();
  for (const [col, row] of pose) {
    const left = (col + 2) * sx, right = (col + 3) * sx;
    const top = (row + 2) * sy, bottom = (row + 3) * sy;
    for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
      for (let x = Math.floor(left); x < Math.ceil(right); x++) {
        const area = (Math.min(x + 1, right) - Math.max(x, left)) * (Math.min(y + 1, bottom) - Math.max(y, top));
        const key = keyOf(x, y);
        coverage.set(key, (coverage.get(key) ?? 0) + area);
      }
    }
  }
  return [...coverage].filter(([, area]) => area >= .34).map(([key]) => key.split(',').map(Number));
}

export function projectPose(pose, columns, direction, col, row) {
  return pose.map(([x, y]) => [col + (direction === 1 ? x : columns - 1 - x), row + y]);
}

function progressAt(state, time) {
  const t = state.duration ? Math.max(0, Math.min(1, (time - state.started) / state.duration)) : 1;
  return state.from + (state.to - state.from) * t;
}

// Each occupied hole stays fixed. Only the length of its two thread passes changes.
export class StitchTransitions {
  constructor(color = BIRD_COLOR) {
    this.color = color;
    this.states = new Map();
    this.target = [];
    this.animating = false;
  }
  setTarget(cells, time, immediate = false) {
    this.target = cells;
    const target = new Map(cells.map(([col, row]) => [keyOf(col, row), { col, row }]));
    if (immediate) this.states.clear();
    for (const key of new Set([...this.states.keys(), ...target.keys()])) {
      const previous = this.states.get(key), cell = target.get(key) ?? previous;
      const to = target.has(key) ? 1 : 0;
      if (previous?.to === to) continue;
      const from = immediate ? to : previous ? progressAt(previous, time) : 0;
      if (from === 0 && to === 0) { this.states.delete(key); continue; }
      this.states.set(key, { col: cell.col, row: cell.row, from, to, started: time, duration: 70 * Math.abs(to - from) });
    }
  }
  sample(time) {
    const cells = new Map();
    this.animating = false;
    for (const [key, state] of this.states) {
      const progress = progressAt(state, time);
      this.animating ||= progress !== state.to;
      if (progress === 0 && state.to === 0) { this.states.delete(key); continue; }
      if (progress > 0) cells.set(key, { col: state.col, row: state.row, color: this.color, progress });
    }
    return cells;
  }
}

// The surface owns the animation clock and draws these cells alongside its other stitches.
// `sky` is the band the dove may use, { top, bottom } in px, with the paper's
// bounds as `avoid`; the scene supplies it. The same seed flies the same path.
export class BirdFlight {
  constructor(width, height, view, { paused = false, seed = 1, sky = {} } = {}) {
    this.paused = paused;
    this.seed = seed;
    this.sky = sky;
    this.elapsed = 0;
    this.lastTime = null;
    this.revealTime = paused ? REVEAL_DURATION : 0;
    this.revealTarget = REVEAL_DURATION;
    this.revealRate = 1;
    this.transitions = new StitchTransitions();
    this.entrance = new StitchEntrance({ sweep: ENTRANCE.wordmark, reduced: paused });
    this.resize(width, height, view);
  }
  resize(width, height, view, sky = this.sky) {
    const previousStage = this.stage;
    this.view = { ...view };
    this.sky = sky;
    this.pitch = GRID * view.scale;
    const sourceSide = Math.max(BIRD_COLUMNS + 4, BIRD_ROWS + 4);
    // Scale the source chart, reducing it further only when it needs to fit
    // a shorter or narrower screen. Preserve the pose's cell count when
    // surface spacing changes.
    const referencePitch = this.pitch / surfaceSpacing(width);
    const maxSide = Math.min(sourceSide * referencePitch, width * .72, height * .55) * FIGURE_SCALE;
    const side = Math.max(8, Math.round(maxSide / referencePitch));
    this.columns = Math.max(1, Math.round(side * (BIRD_COLUMNS + 4) / sourceSide));
    this.rows = Math.max(1, Math.round(side * (BIRD_ROWS + 4) / sourceSide));
    this.frames = WING_POSES.map(pose => samplePose(pose, this.columns, this.rows));
    this.motionSignature = null;
    if (previousStage && this.revealTarget === REVEAL_DURATION) {
      this.revealTime = REVEAL_DURATION;
      this.entrance.finish();
    }
    // Plan in bird-local coordinates across every pose and pitch, so the
    // front travels with the bird and remains coherent while it changes shape.
    const silhouette = new Map();
    const pivotX = 28 * this.columns / (BIRD_COLUMNS + 4), pivotY = 37 * this.rows / (BIRD_ROWS + 4);
    for (const angle of [0, -FLIGHT.maxPitch, -FLIGHT.maxPitch / 2, FLIGHT.maxPitch / 2, FLIGHT.maxPitch]) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const [col, row] of this.frames.flat()) {
        const x = Math.round(pivotX + (col - pivotX) * cos - (row - pivotY) * sin);
        const y = Math.round(pivotY + (col - pivotX) * sin + (row - pivotY) * cos);
        silhouette.set(keyOf(x, y), [x, y]);
      }
    }
    // Replan on resize too: later reveals use the current surface lattice.
    for (const [col, row] of [...silhouette.values()]) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = col + dx, y = row + dy;
        if (x >= 0 && x < this.columns && y >= 0 && y < this.rows) silhouette.set(keyOf(x, y), [x, y]);
      }
    }
    this.entrance.plan([flameEntranceOrder([...silhouette.values()], { origin: 'center' })]);
    this.stage = { width, height, birdWidth: this.columns * this.pitch, birdHeight: this.rows * this.pitch, ...sky };
    if (this.flight) this.flight.resize(this.stage);
    else this.flight = new FlightPath(this.stage, { seed: this.seed, poses: this.frames.length });
    const { cells, signature } = this.targetAt();
    this.signature = signature;
    this.transitions.setTarget(cells, this.elapsed, true);
    this.cells = this.reveal(this.transitions.sample(this.elapsed));
    this.lastTime = null;
  }
  targetAt() {
    // Wingbeats and the body's follow-through run on the flight's wing clock,
    // so they speed up in a climb and hold still in a glide.
    const { x, y, direction, pitch, wing } = this.flight.state;
    const pose = Math.floor(wing) % this.frames.length;
    const motion = Math.floor(wing * BIRD_FRAME_MS / BODY_FRAME_MS);
    const attitude = Math.round(pitch / PITCH_STEP) * PITCH_STEP || 0;
    const motionSignature = `${pose}:${motion}:${attitude}`;
    if (motionSignature !== this.motionSignature) {
      this.movingPose = motion === 0 && attitude === 0 ? this.frames[pose]
        : samplePose(articulatePose(WING_POSES[pose], motion * BODY_FRAME_MS, attitude), this.columns, this.rows);
      this.motionSignature = motionSignature;
    }
    const col = Math.round((x - this.view.x) / this.pitch);
    const row = Math.round((y - this.view.y) / this.pitch);
    this.position = { col, row, direction };
    return {
      cells: projectPose(this.movingPose, this.columns, direction, col, row),
      signature: `${motionSignature}:${col}:${row}:${direction}`,
    };
  }
  reveal(cells) {
    if (this.revealTime >= REVEAL_DURATION) {
      if (this.revealTarget === REVEAL_DURATION) this.entrance.finish();
      return cells;
    }
    this.entrance.finished = false;
    if (this.revealTime <= 0) return new Map();
    const visible = new Map();
    for (const [key, cell] of cells) {
      const x = cell.col - this.position.col;
      const localCol = this.position.direction === 1 ? x : this.columns - 1 - x;
      const localKey = keyOf(localCol, cell.row - this.position.row);
      if (!this.entrance.offsets.has(localKey)) continue;
      const progress = cell.progress * this.entrance.progress(localKey, this.revealTime);
      if (progress > 0) visible.set(key, { ...cell, progress });
    }
    return visible;
  }
  hitTest(x, y) {
    const col = Math.floor((x - this.view.x) / this.pitch);
    const row = Math.floor((y - this.view.y) / this.pitch);
    const cell = this.cells.get(keyOf(col, row));
    return cell?.progress >= .2 ? cell : null;
  }
  hoverMessage(x, y) {
    const cell = this.hitTest(x, y);
    if (!cell) return '';
    const passed = this.view.x + (cell.col + .5) * this.pitch >= this.stage.width / 2;
    return passed ? 'PALESTINE WILL BE FREE' : 'FROM RIVER TO THE SEA';
  }
  update(now) {
    if (this.paused) { this.lastTime = null; return false; }
    const wasEntering = this.revealTime !== this.revealTarget;
    const revealDelta = this.lastTime === null ? 0 : Math.max(0, now - this.lastTime);
    const delta = Math.min(revealDelta, 100);
    this.lastTime = now;
    this.elapsed += delta;
    this.flight.advance(delta);
    const step = revealDelta * this.revealRate;
    this.revealTime = this.revealTarget > this.revealTime
      ? Math.min(this.revealTarget, this.revealTime + step)
      : Math.max(this.revealTarget, this.revealTime - step);
    const { cells, signature } = this.targetAt();
    const changed = signature !== this.signature;
    const wasAnimating = this.transitions.animating;
    if (changed) this.transitions.setTarget(cells, this.elapsed);
    this.signature = signature;
    this.cells = this.reveal(this.transitions.sample(this.elapsed));
    return changed || wasAnimating || this.transitions.animating || wasEntering;
  }
  suspend() { this.lastTime = null; }
  setVisible(visible, { duration = REVEAL_DURATION, immediate = this.paused } = {}) {
    this.revealTarget = visible ? REVEAL_DURATION : 0;
    this.revealRate = REVEAL_DURATION / duration;
    if (immediate || duration <= 0) this.revealTime = this.revealTarget;
    // Scrub the original center-out stitch reveal in either direction, without
    // restarting the flight, wingbeat, or changing any stored embroidery.
    this.entrance.finished = this.revealTime >= REVEAL_DURATION;
    this.cells = this.reveal(this.transitions.sample(this.elapsed));
  }
  setPaused(paused) {
    this.paused = paused;
    this.lastTime = null;
    if (paused) {
      this.revealTime = this.revealTarget;
      this.entrance.finished = this.revealTime >= REVEAL_DURATION;
      this.transitions.setTarget(this.transitions.target, this.elapsed, true);
      this.cells = this.reveal(this.transitions.sample(this.elapsed));
    }
  }
}
