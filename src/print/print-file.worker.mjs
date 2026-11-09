import { unzipSync } from 'three/addons/libs/fflate.module.js';

// Reads the print file itself (the 3MF the page offers for download): every
// vertex and triangle as written, nothing reduced or replaced. Only the
// light's normals are worked out here, as a slicer's preview does: smooth
// across the relief, crisp where faces meet at more than CREASE (the cut
// edge, the thread).
const CREASE = 35 * Math.PI / 180;
// Drawn as lines only where it's a real corner: the cut edge, the pocket, the tabs.
const CORNER = 60 * Math.PI / 180;

self.onmessage = async ({ data: { url } }) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const total = Number(response.headers.get('content-length')) || 0;
    const reader = response.body.getReader();
    const chunks = [];
    let got = 0, told = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      if (got - told > 1 << 18) { told = got; self.postMessage({ loaded: got, total }); }
    }
    self.postMessage({ loaded: got, total: got, reading: true });
    const zip = new Uint8Array(got);
    let at = 0;
    for (const chunk of chunks) { zip.set(chunk, at); at += chunk.length; }
    const files = unzipSync(zip, { filter: file => file.name.endsWith('.model') });
    const name = Object.keys(files)[0];
    if (!name) throw new Error('no 3D model in the file');
    const objects = readModel(files[name]).map(object => ({ ...object, ...creased(object.positions, object.indices) }));
    self.postMessage({ objects: objects.map(({ name, vertices, triangles, positions, normals, indices, lines }) =>
      ({ name, vertices, triangles, positions, normals, indices, lines })) },
    objects.flatMap(o => [o.positions.buffer, o.normals.buffer, o.indices.buffer, o.lines.buffer]));
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

// —— The 3MF model (XML), read byte by byte ——
function readModel(bytes) {
  const objects = [];
  const n = bytes.length;
  let i = 0, object = null;
  const grow = (array, need) => {
    if (need <= array.length) return array;
    const next = new array.constructor(Math.max(need, array.length * 2));
    next.set(array);
    return next;
  };
  const is = (at, text) => {
    for (let k = 0; k < text.length; k++) if (bytes[at + k] !== text.charCodeAt(k)) return false;
    return true;
  };
  // A number from `at`, to the closing quote: [value, index after it].
  const number = at => {
    let sign = 1, value = 0, scale = 0, exp = 0, expSign = 1, c = bytes[at];
    if (c === 45) { sign = -1; c = bytes[++at]; } else if (c === 43) c = bytes[++at];
    while (c >= 48 && c <= 57) { value = value * 10 + c - 48; c = bytes[++at]; }
    if (c === 46) {
      c = bytes[++at];
      while (c >= 48 && c <= 57) { value = value * 10 + c - 48; scale++; c = bytes[++at]; }
    }
    if (c === 101 || c === 69) {
      c = bytes[++at];
      if (c === 45) { expSign = -1; c = bytes[++at]; } else if (c === 43) c = bytes[++at];
      while (c >= 48 && c <= 57) { exp = exp * 10 + c - 48; c = bytes[++at]; }
    }
    return [sign * value * 10 ** (expSign * exp - scale), at];
  };
  // The tag's attributes, from after its name to its end: calls take(name, at).
  const attributes = (at, take) => {
    for (;;) {
      while (bytes[at] === 32 || bytes[at] === 10 || bytes[at] === 13 || bytes[at] === 9) at++;
      if (bytes[at] === 47 || bytes[at] === 62 || at >= n) return at;
      const start = at;
      while (bytes[at] !== 61) at++;
      const attr = String.fromCharCode(...bytes.subarray(start, at));
      at += 2;   // ="
      at = take(attr, at);
      while (bytes[at] !== 34) at++;
      at++;
    }
  };
  while (i < n) {
    if (bytes[i] !== 60) { i++; continue; }
    if (is(i, '<vertex ')) {
      const v = object.vertices * 3;
      object.positions = grow(object.positions, v + 3);
      i = attributes(i + 8, (attr, at) => {
        const [value, end] = number(at);
        const k = attr === 'x' ? 0 : attr === 'y' ? 1 : attr === 'z' ? 2 : -1;
        if (k >= 0) object.positions[v + k] = value;
        return end;
      });
      object.vertices++;
    } else if (is(i, '<triangle ')) {
      const t = object.triangles * 3;
      object.indices = grow(object.indices, t + 3);
      i = attributes(i + 10, (attr, at) => {
        const [value, end] = number(at);
        const k = attr === 'v1' ? 0 : attr === 'v2' ? 1 : attr === 'v3' ? 2 : -1;
        if (k >= 0) object.indices[t + k] = value;
        return end;
      });
      object.triangles++;
    } else if (is(i, '<object ')) {
      object = { name: '', vertices: 0, triangles: 0, positions: new Float32Array(1 << 16), indices: new Uint32Array(1 << 16) };
      i = attributes(i + 8, (attr, at) => {
        let end = at;
        while (bytes[end] !== 34) end++;
        if (attr === 'name') object.name = new TextDecoder().decode(bytes.subarray(at, end));
        return end;
      });
      objects.push(object);
    } else i++;
  }
  return objects.map(o => ({ ...o, positions: o.positions.slice(0, o.vertices * 3), indices: o.indices.slice(0, o.triangles * 3) }));
}

// —— Normals ——
// Each corner takes the average of the faces round its vertex that turn from
// its own face by less than CREASE (weighted by their area); a vertex's
// corners that agree share one vertex, the rest get their own copies.
function creased(P, I) {
  const nv = P.length / 3, nt = I.length / 3, cos = Math.cos(CREASE);
  const area = new Float32Array(nt * 3), unit = new Float32Array(nt * 3);
  for (let f = 0; f < nt; f++) {
    const a = I[3 * f] * 3, b = I[3 * f + 1] * 3, c = I[3 * f + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const len = Math.hypot(x, y, z) || 1;
    area[3 * f] = x; area[3 * f + 1] = y; area[3 * f + 2] = z;
    unit[3 * f] = x / len; unit[3 * f + 1] = y / len; unit[3 * f + 2] = z / len;
  }
  // The faces round each vertex.
  const start = new Uint32Array(nv + 1);
  for (let k = 0; k < I.length; k++) start[I[k] + 1]++;
  for (let v = 0; v < nv; v++) start[v + 1] += start[v];
  const fill = start.slice(0, nv), faces = new Uint32Array(I.length);
  for (let k = 0; k < I.length; k++) faces[fill[I[k]]++] = (k / 3) | 0;

  const positions = new Float32Array(I.length * 3), normals = new Float32Array(I.length * 3);
  const indices = new Uint32Array(I.length);
  let made = 0;
  for (let v = 0; v < nv; v++) {
    const first = made;
    for (let j = start[v]; j < start[v + 1]; j++) {
      const f = faces[j];
      const k = 3 * f + (I[3 * f] === v ? 0 : I[3 * f + 1] === v ? 1 : 2);
      let x = 0, y = 0, z = 0;
      for (let i = start[v]; i < start[v + 1]; i++) {
        const g = faces[i];
        if (unit[3 * f] * unit[3 * g] + unit[3 * f + 1] * unit[3 * g + 1] + unit[3 * f + 2] * unit[3 * g + 2] < cos) continue;
        x += area[3 * g]; y += area[3 * g + 1]; z += area[3 * g + 2];
      }
      const len = Math.hypot(x, y, z) || 1;
      x /= len; y /= len; z /= len;
      let found = -1;
      for (let s = first; s < made; s++) {
        if (normals[3 * s] * x + normals[3 * s + 1] * y + normals[3 * s + 2] * z > .99999) { found = s; break; }
      }
      if (found < 0) {
        found = made++;
        positions[3 * found] = P[3 * v]; positions[3 * found + 1] = P[3 * v + 1]; positions[3 * found + 2] = P[3 * v + 2];
        normals[3 * found] = x; normals[3 * found + 1] = y; normals[3 * found + 2] = z;
      }
      indices[k] = found;
    }
  }
  return { positions: positions.slice(0, made * 3), normals: normals.slice(0, made * 3), indices, lines: creaseLines(P, I, area, unit, Math.cos(CORNER)) };
}

// The file's corners, where two faces meet at more than CORNER: drawn as
// lines, they show its outlines as a drawing does, at any distance.
// Slivers (next to no width for their length) have no reliable direction
// once their corners are rounded to the file's 0.0001 mm: never a corner.
function creaseLines(P, I, area, unit, cos) {
  const tiny = f => {
    const a = I[3 * f] * 3, b = I[3 * f + 1] * 3, c = I[3 * f + 2] * 3;
    const edge = (p, q) => (P[p] - P[q]) ** 2 + (P[p + 1] - P[q + 1]) ** 2 + (P[p + 2] - P[q + 2]) ** 2;
    const longest = Math.max(edge(a, b), edge(b, c), edge(c, a));
    return Math.hypot(area[3 * f], area[3 * f + 1], area[3 * f + 2]) / 2 < .01 * longest;
  };
  const seen = new Map(), out = [];
  const nv = P.length / 3;
  for (let k = 0; k < I.length; k++) {
    const f = (k / 3) | 0, a = I[k], b = I[f * 3 + (k + 1) % 3];
    const key = a < b ? a * nv + b : b * nv + a;
    const g = seen.get(key);
    if (g === undefined) { seen.set(key, f); continue; }
    seen.delete(key);
    if (tiny(f) || tiny(g)) continue;
    if (unit[3 * f] * unit[3 * g] + unit[3 * f + 1] * unit[3 * g + 1] + unit[3 * f + 2] * unit[3 * g + 2] >= cos) continue;
    out.push(P[3 * a], P[3 * a + 1], P[3 * a + 2], P[3 * b], P[3 * b + 1], P[3 * b + 2]);
  }
  return new Float32Array(out);
}
