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

export function articulatePose(pose, time) {
  if (time === 0) return pose;
  const motion = bodyMotionAt(time);
  const source = new Set(pose.map(([x, y]) => `${x},${y}`));
  const cells = [];
  // Inverse sampling keeps solid feather areas solid when the body flexes.
  // The two-cell source padding already used by samplePose holds the small
  // movement; each resulting X still lands on a hole of the surface grid.
  for (let y = -2; y < BIRD_ROWS + 2; y++) {
    for (let x = -2; x < BIRD_COLUMNS + 2; x++) {
      let sx = x, sy = y;
      for (let i = 0; i < 3; i++) {
        const [tx, ty] = moveBirdPoint(sx, sy, motion);
        sx += x - tx;
        sy += y - ty;
      }
      if (source.has(`${Math.round(sx)},${Math.round(sy)}`)) cells.push([x, y]);
    }
  }
  return cells;
}
