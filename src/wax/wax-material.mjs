import { distanceTo } from './distance-field.mjs';
import { clamp } from '../shared/math.mjs';

const bump = (distance, center, spread) => Math.exp(-(((distance - center) / spread) ** 2));

// Reconstructed relief, not measured geometry. Distances follow the actual
// transparent image outline so the rolled lip is never a generic ellipse.
export function buildWaxSurface(rgba, width, height) {
  const count = width * height;
  const alpha = new Uint8Array(count);
  const tone = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    alpha[i] = rgba[i * 4 + 3];
    tone[i] = (.6 * rgba[i * 4] + .25 * rgba[i * 4 + 1] + .15 * rgba[i * 4 + 2]) / 255;
  }
  const distance = distanceTo(alpha, width, height, false);
  const heights = new Float32Array(count);
  const rim = new Float32Array(count);
  // Scale the reference profile with the source rather than the CSS size.
  const pitch = width / 512;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (alpha[i] < 96) continue;
    const d = distance[i] / pitch;
    const sample = (dx, dy) => tone[clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1)];
    const detail = (sample(-1, 0) + sample(1, 0) + sample(0, -1) + sample(0, 1) + tone[i] * 4) / 8;
    heights[i] = pitch * (.55 * (1 - Math.exp(-d / 1.7))
      + 3.3 * bump(d, 8, 5.5) - .7 * bump(d, 16, 3)
      + 1.05 * bump(d, 21, 3.2) + detail * .85);
    rim[i] = Math.min(1, bump(d, 8, 8) + .6 * bump(d, 21, 4));
  }
  const normals = new Float32Array(count * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (alpha[i] < 96) continue;
    const sample = (dx, dy) => {
      const neighbor = clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1);
      return alpha[neighbor] >= 96 ? heights[neighbor] : 0;
    };
    const nx = (sample(-1, 0) - sample(1, 0)) * .5;
    const ny = (sample(0, -1) - sample(0, 1)) * .5;
    const length = Math.hypot(nx, ny, 1);
    normals[i * 3] = nx / length;
    normals[i * 3 + 1] = ny / length;
    normals[i * 3 + 2] = 1 / length;
  }
  return { width, height, alpha, normals, rim, pigment: new Uint8ClampedArray(rgba) };
}

export function shadeWaxSurface(surface, x = 0, y = -.35, output = new Uint8ClampedArray(surface.width * surface.height * 4)) {
  const { width, height, alpha, normals, rim, pigment } = surface;
  const aspect = width / height;
  const lightX = clamp(x, -1, 1) * aspect, lightY = clamp(y, -1, 1);
  output.fill(0);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const i = row * width + col;
    if (alpha[i] < 96) continue;
    let lx = lightX - (col / (width - 1) * 2 - 1) * aspect;
    let ly = lightY - (row / (height - 1) * 2 - 1);
    const length = Math.sqrt(lx * lx + ly * ly + 4.84);
    lx /= length; ly /= length;
    const hz = 2.2 / length + 1;
    const halfLength = Math.sqrt(lx * lx + ly * ly + hz * hz);
    const dot = Math.max(0, (normals[i * 3] * lx + normals[i * 3 + 1] * ly + normals[i * 3 + 2] * hz) / halfLength);
    const d2 = dot * dot, d4 = d2 * d2, broad = d4 * d4;
    const sharp = broad * broad;
    // Make the moving light legible on the small seal, with the strongest
    // response still belonging to its slopes and rolled edges.
    const strength = (sharp * 1.25 + broad * .4) * (.46 + rim[i] * .54);
    const p = i * 4;
    // Keep pigment in the added reflection; the photo retains its original
    // pale specular detail. No cream/white spotlight is laid over the seal.
    output[p] = 255;
    output[p + 1] = Math.min(220, pigment[p + 1] * 1.1 + 30);
    output[p + 2] = Math.min(210, pigment[p + 2] * 1.05 + 20);
    output[p + 3] = Math.round(alpha[i] * Math.min(.95, strength));
  }
  return output;
}
