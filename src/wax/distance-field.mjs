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
