// Exact squared Euclidean distance transform, separable in rows and columns.
// A distance field gives the same bevel width on straight and curved paths.
export function distanceTo(mask, width, height, inside) {
  const field = new Float32Array(width * height);
  const size = Math.max(width, height);
  const line = new Float64Array(size);
  const result = new Float64Array(size);
  const sites = new Int32Array(size);
  const cuts = new Float64Array(size + 1);
  function transform(length) {
    let k = 0;
    sites[0] = 0; cuts[0] = -Infinity; cuts[1] = Infinity;
    for (let q = 1; q < length; q++) {
      let s;
      do {
        const p = sites[k];
        s = ((line[q] + q * q) - (line[p] + p * p)) / (2 * (q - p));
        if (s > cuts[k]) break;
        k--;
      } while (k >= 0);
      k++; sites[k] = q; cuts[k] = s; cuts[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < length; q++) {
      while (cuts[k + 1] < q) k++;
      result[q] = (q - sites[k]) ** 2 + line[sites[k]];
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) line[x] = (mask[y * width + x] >= 128) === inside ? 0 : 1e12;
    transform(width);
    for (let x = 0; x < width; x++) field[y * width + x] = result[x];
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) line[y] = field[y * width + x];
    transform(height);
    for (let y = 0; y < height; y++) field[y * width + x] = Math.sqrt(result[y]);
  }
  return field;
}

export function reliefHeight(distance, depth, bevel) {
  const t = Math.max(0, Math.min(1, distance / bevel));
  return depth * t * t * (3 - 2 * t);
}

function noise(x, y, seed = 0) {
  let n = Math.imul(x ^ seed, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295 - .5;
}

function softNoise(x, y, seed) {
  const a = Math.floor(x), b = Math.floor(y);
  const u = x - a, v = y - b;
  const top = noise(a, b, seed) * (1 - u) + noise(a + 1, b, seed) * u;
  const bottom = noise(a, b + 1, seed) * (1 - u) + noise(a + 1, b + 1, seed) * u;
  return top * (1 - v) + bottom * v;
}

function soften(field, width, height) {
  const buffer = new Float32Array(field.length);
  const weights = [1, 4, 6, 4, 1];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let total = 0;
    for (let k = -2; k <= 2; k++) total += field[y * width + Math.max(0, Math.min(width - 1, x + k))] * weights[k + 2];
    buffer[y * width + x] = total / 16;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let total = 0;
    for (let k = -2; k <= 2; k++) total += buffer[Math.max(0, Math.min(height - 1, y + k)) * width + x] * weights[k + 2];
    field[y * width + x] = total / 16;
  }
}

export function renderPaper({ ornament, paper, width, height, settings }) {
  const { depth, bevel, paperHeight, paperBevel, grain, tone } = settings;
  const inner = distanceTo(ornament, width, height, false);
  const outer = distanceTo(ornament, width, height, true);
  const edge = distanceTo(paper, width, height, false);
  const elevations = new Float32Array(width * height);
  for (let i = 0; i < elevations.length; i++) {
    // Positive relief belongs exclusively to the original black SVG paths.
    const d = ornament[i] >= 128 ? inner[i] - .5 : .5 - outer[i];
    inner[i] = d;
    elevations[i] = reliefHeight(d, depth, bevel) + reliefHeight(edge[i] - .5, paperHeight, paperBevel);
  }
  soften(elevations, width, height);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!paper[i]) continue;
      const dx = (elevations[i + 1] - elevations[i - 1]) * .5;
      const dy = (elevations[i + width] - elevations[i - width]) * .5;
      const diffuse = (.44 * dx + .55 * dy + .71) / Math.hypot(dx, dy, 1) - .71;
      // A faint contact shadow on the flat paper below a raised path.
      const contact = inner[i] < 0 ? Math.exp(inner[i] / 2.8) * 2.1 : 0;
      const fiber = (noise(x, y) * .65
        + softNoise(x * .34 + y * .12, y * .7, 91) * .9
        + softNoise(x * .15, y * .15, 137) * .6) * grain;
      const formation = Math.sin(x * .016 + Math.sin(y * .024)) * .25;
      const value = tone + diffuse * 105 - contact + fiber + formation;
      const p = i * 4;
      pixels[p] = value; pixels[p + 1] = value; pixels[p + 2] = value - .7;
      pixels[p + 3] = paper[i];
    }
  }
  return pixels;
}
