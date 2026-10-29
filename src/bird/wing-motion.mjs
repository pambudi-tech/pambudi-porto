import { BIRD_POSES } from './bird-data.mjs';
import { clamp } from '../shared/math.mjs';

// Retain the approved raised silhouette. Include the far wing's inner feathers
// down to its actual shoulder; the old cut at row 24 left a rigid horizontal
// strip beside the head when the outer wing flipped down.
const raised = BIRD_POSES[0];
const isNear = (x, y) => x < 26 && y < 31;
const isFar = (x, y) => x >= 26 && (y < 24 || (x < 34 && y < 31));
const near = raised.filter(([x, y]) => isNear(x, y));
const far = raised.filter(([x, y]) => isFar(x, y));
const body = raised.filter(([x, y]) => !isNear(x, y) && !isFar(x, y));

// A separate torso sits underneath the moving wing roots. The old source
// segmentation used those roots to supply the back, so lowering the wings
// removed the upper body's volume. This contour joins the tail to the neck.
const back = [];
for (let x = 14; x <= 33; x++) {
  const neck = clamp((x - 29) / 5);
  const top = Math.round(35 - 7 * Math.sin((x - 14) / 20 * Math.PI / 2)
    - 3 * neck * neck * (3 - 2 * neck));
  for (let y = top; y <= 34; y++) back.push([x, y]);
}

function wingEnvelope(coverage) {
  const rows = new Map();
  for (const [key, area] of coverage) {
    if (area < .34) continue;
    const [x, y] = key.split(',').map(Number);
    const row = rows.get(y) ?? [x, x];
    row[0] = Math.min(row[0], x);
    row[1] = Math.max(row[1], x);
    rows.set(y, row);
  }
  return ([x, y]) => {
    const row = rows.get(y);
    return row && x >= row[0] && x <= row[1];
  };
}

export function wingPoint(x, y, frame, distant = false) {
  const phase = frame / BIRD_POSES.length * Math.PI * 2;
  const sx = distant ? 28 : 25, sy = 31;
  const dx = x - sx, dy = y - sy;
  const span = clamp(Math.hypot(dx, dy) / (distant ? 33 : 39));
  const down = (1 - Math.cos(phase)) / 2;
  // Wrist and primaries arrive later than the shoulder. Lag fades at the top
  // of the stroke so the original fully raised feather pattern stays exact.
  const delay = (distant ? .24 : 0) + .48 * span * span;
  const localPhase = phase - delay * down;
  const flap = -.05 + 1.05 * Math.cos(localPhase);
  const width = .85 + .15 * Math.abs(flap);
  // A swept, curved leading edge replaces the horizontal fold. The outer wing
  // cups through the downstroke instead of reflecting as one flat sheet.
  const sweep = Math.sin(phase) * .045 * span;
  const cup = down * (distant ? .24 : -.12) * dx * span;
  return [sx + dx * width + dy * sweep, sy + dy * flap + cup];
}

function clip(polygon, axis, limit, keepAbove) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const insideA = keepAbove ? a[axis] >= limit : a[axis] <= limit;
    const insideB = keepAbove ? b[axis] >= limit : b[axis] <= limit;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

function rasterize(wing, frame, distant, coverage) {
  for (const [x, y] of wing) {
    const polygon = [[x - .5, y - .5], [x + .5, y - .5], [x + .5, y + .5], [x - .5, y + .5]]
      .map(([px, py]) => wingPoint(px, py, frame, distant));
    const xs = polygon.map(([px]) => px), ys = polygon.map(([, py]) => py);
    for (let row = Math.ceil(Math.min(...ys) - .5); row <= Math.floor(Math.max(...ys) + .5); row++) {
      for (let col = Math.ceil(Math.min(...xs) - .5); col <= Math.floor(Math.max(...xs) + .5); col++) {
        let cell = clip(polygon, 0, col - .5, true);
        cell = clip(cell, 0, col + .5, false);
        cell = clip(cell, 1, row - .5, true);
        cell = clip(cell, 1, row + .5, false);
        const area = Math.abs(cell.reduce((sum, a, i) => {
          const b = cell[(i + 1) % cell.length];
          return sum + a[0] * b[1] - b[0] * a[1];
        }, 0)) / 2;
        const key = `${col},${row}`;
        coverage.set(key, (coverage.get(key) ?? 0) + area);
      }
    }
  }
}

export const WING_POSES = BIRD_POSES.map((pose, frame) => {
  if (frame === 0) return pose;
  const nearCoverage = new Map(), farCoverage = new Map();
  rasterize(near, frame, false, nearCoverage);
  rasterize(far, frame, true, farCoverage);
  const cells = new Map(body.map(cell => [cell.join(','), cell]));
  const underNearWing = wingEnvelope(nearCoverage), underFarWing = wingEnvelope(farCoverage);
  // Keep the raised wing's decorative gaps visible. As a wing clears the
  // torso, the continuous back underneath is revealed rather than carried off.
  for (const cell of back) {
    if (!underNearWing(cell) && !underFarWing(cell)) cells.set(cell.join(','), cell);
  }
  const coverage = new Map(nearCoverage);
  for (const [key, area] of farCoverage) coverage.set(key, (coverage.get(key) ?? 0) + area);
  for (const [key, area] of coverage) if (area >= .34) cells.set(key, key.split(',').map(Number));
  return [...cells.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
});
