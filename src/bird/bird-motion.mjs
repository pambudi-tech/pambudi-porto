import { BIRD_COLUMNS, BIRD_ROWS, BIRD_FRAME_MS, BIRD_POSES } from './bird-data.mjs';

export const BODY_FRAME_MS = 40;
const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Coordinates are in the approved source pattern; the head faces right and
// the tail trails to the left. All parts share the breast's lift and pitch.
// Only the head and tail add local follow-through here; wing articulation is
// applied first in wing-motion.mjs, at the existing flap timing.
export function bodyMotionAt(time) {
  const phase = time / (BIRD_FRAME_MS * BIRD_POSES.length) * Math.PI * 2;
  const settle = smoothstep(0, 400, time);
  const drift = Math.sin(time / 2700);
  return {
    lift: settle * (-.85 * Math.sin(phase - .25) + .25 * drift),
    pitch: settle * (.032 * Math.sin(phase - .55) + .009 * drift),
    head: settle * .45 * Math.sin(phase - .9),
    tail: settle * (1.55 * Math.sin(phase - 1.15) + .35 * Math.sin(time / 1900)),
  };
}

export function moveBirdPoint(x, y, motion) {
  const tail = smoothstep(25, 5, x) * smoothstep(31, 38, y);
  const head = smoothstep(29, 38, x) * smoothstep(21, 25, y) * (1 - smoothstep(31, 36, y));
  const dx = x - 26, dy = y - 35;
  const cos = Math.cos(motion.pitch), sin = Math.sin(motion.pitch);
  return [
    26 + dx * cos - dy * sin,
    35 + dx * sin + dy * cos + motion.lift
      + tail * motion.tail
      // The neck absorbs some body pitch, keeping the gaze steadier.
      + head * (motion.head - dx * sin * .65),
  ];
}

// `pitch` is the flight's climb or dive: it turns the whole figure about the
// breast after the body's own follow-through. Negative raises the head.
// Each pose's cells as numbers, built once: articulatePose looks them up for
// every hole around the dove, every frame it flies.
const SOURCE_SPAN = 4096;
const sources = new WeakMap();
const sourceOf = pose => {
  let source = sources.get(pose);
  if (!source) sources.set(pose, source = new Set(pose.map(([x, y]) => x * SOURCE_SPAN + y)));
  return source;
};

export function articulatePose(pose, time, pitch = 0) {
  if (time === 0 && pitch === 0) return pose;
  const motion = bodyMotionAt(time);
  const source = sourceOf(pose);
  const cells = [];
  const cos = Math.cos(pitch), sin = Math.sin(pitch);
  const bodyCos = Math.cos(motion.pitch), bodySin = Math.sin(motion.pitch);
  // Inverse sampling keeps solid feather areas solid when the body flexes.
  // The two-cell source padding already used by samplePose holds the small
  // movement, widened by how far the pitch swings the wingtips and tail.
  // Each resulting X still lands on a hole of the surface grid.
  const reach = 2 + Math.ceil(36 * Math.abs(sin));
  for (let y = -reach; y < BIRD_ROWS + reach; y++) {
    for (let x = -reach; x < BIRD_COLUMNS + reach; x++) {
      // Undo the pitch exactly, then solve for the body motion.
      const ux = 26 + (x - 26) * cos + (y - 35) * sin;
      const uy = 35 - (x - 26) * sin + (y - 35) * cos;
      let sx = ux, sy = uy;
      for (let i = 0; i < 3; i++) {
        // moveBirdPoint, inlined.
        const tail = smoothstep(25, 5, sx) * smoothstep(31, 38, sy);
        const head = smoothstep(29, 38, sx) * smoothstep(21, 25, sy) * (1 - smoothstep(31, 36, sy));
        const dx = sx - 26, dy = sy - 35;
        const tx = 26 + dx * bodyCos - dy * bodySin;
        const ty = 35 + dx * bodySin + dy * bodyCos + motion.lift
          + tail * motion.tail
          + head * (motion.head - dx * bodySin * .65);
        sx += ux - tx;
        sy += uy - ty;
      }
      if (source.has(Math.round(sx) * SOURCE_SPAN + Math.round(sy))) cells.push([x, y]);
    }
  }
  return cells;
}
