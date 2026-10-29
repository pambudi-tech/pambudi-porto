// Prints works photos as risographs: eight inks, taken from the photo's own
// eight strongest colours, each laid as its own grainy layer and overprinted,
// in register, on cream paper with fibres and specks.
//
// Each photo is printed once, at its card's size, into an ordinary image the
// card shows, so it slides, tilts and flies with the card like any photo.

export const RISO = Object.freeze({
  inks: 8,
  paper: [.97, .94, .88],      // cream
  grain: .8,                   // CSS pixels per grain of ink
});

export function inkPalette(image, count = RISO.inks) {
  const size = 48, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data, pixels = [];
  for (let i = 0; i < data.length; i += 4) pixels.push([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]);
  const bins = new Map();
  for (const [r, g, b] of pixels) {
    const key = `${Math.floor(r * 15.99)},${Math.floor(g * 15.99)},${Math.floor(b * 15.99)}`;
    const bin = bins.get(key) ?? bins.set(key, { n: 0, sum: [0, 0, 0] }).get(key);
    bin.n++; bin.sum[0] += r; bin.sum[1] += g; bin.sum[2] += b;
  }
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const frequent = [...bins.values()].sort((a, b) => b.n - a.n).map(bin => bin.sum.map(v => v / bin.n));
  let inks = [];
  for (const colour of frequent) {
    if (inks.length === count) break;
    if (inks.every(ink => distance(ink, colour) > .16)) inks.push(colour);
  }
  for (const colour of frequent) if (inks.length < count && !inks.includes(colour)) inks.push(colour);
  for (let round = 0; round < 6; round++) {
    const sums = inks.map(() => [0, 0, 0, 0]);
    for (const pixel of pixels) {
      let best = 0;
      inks.forEach((ink, i) => { if (distance(pixel, ink) < distance(pixel, inks[best])) best = i; });
      sums[best][0] += pixel[0]; sums[best][1] += pixel[1]; sums[best][2] += pixel[2]; sums[best][3]++;
    }
    inks = inks.map((ink, i) => sums[i][3] ? sums[i].slice(0, 3).map(v => v / sums[i][3]) : ink);
  }
  const luma = ([r, g, b]) => .299 * r + .587 * g + .114 * b;
  return inks.map(ink => {
    const grey = luma(ink);
    return ink.map(v => Math.min(1, Math.max(0, grey + (v - grey) * 1.25)));
  }).sort((a, b) => luma(a) - luma(b));
}

// Both stages of each program share uniforms, so they agree on precision.
const PRINT_VERTEX = `
precision highp float;
attribute vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;

// Prints a photo as a riso into a texture the size of its box.
const PRINT_FRAGMENT = `
precision highp float;
uniform sampler2D photo;
uniform vec2 box, imageSize;
uniform float grain;
uniform vec3 paper;
uniform vec3 inks[8];

vec3 photoAt(vec2 p) {
  float scale = max(box.x / imageSize.x, box.y / imageSize.y);
  return texture2D(photo, (p - box * .5) / scale / imageSize + .5).rgb;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}

void main() {
  // Box pixels, top down.
  vec2 p = vec2(gl_FragCoord.x, box.y - gl_FragCoord.y);

  // Paper: cream with a soft cloud, long fibres and the odd speck.
  vec3 print = paper * (.965 + .05 * noise(p / (grain * 3.0)) - .03 * noise(p * vec2(.015, .22) / grain));
  print *= 1.0 - .35 * step(.9994, hash(floor(p / grain) + 7.3));

  // Each pixel takes exactly one ink, or the bare paper, chosen in
  // proportion to how near the photo's colour is to each. Flat colour
  // prints solid; only where two colours meet does it break into grain,
  // and paper shows only where the photo is truly light.
  vec3 rgb = photoAt(p);
  vec3 toPaper = rgb - paper;
  float paperWeight = exp(-dot(toPaper, toPaper) * 22.0);
  float total = paperWeight;
  for (int j = 0; j < 8; j++) {
    vec3 d = rgb - inks[j];
    total += exp(-dot(d, d) * 22.0);
  }
  // One draw per pixel, from a fine grain with a little clumping.
  float draw = mix(hash(floor(p / grain)), noise(p / (grain * 2.5)), .4) * total;
  vec3 ink = vec3(1.0);
  float reached = paperWeight;
  bool chosen = draw < reached;
  for (int j = 0; j < 8; j++) {
    vec3 d = rgb - inks[j];
    reached += exp(-dot(d, d) * 22.0);
    if (!chosen && draw < reached) { ink = inks[j]; chosen = true; }
  }
  // Ink lies a little unevenly across the sheet.
  float strength = .86 + .1 * noise(p / (grain * 40.0));
  print *= mix(vec3(1.0), ink, strength);
  gl_FragColor = vec4(print, 1.0);
}`;

let printer;

function createPrinter() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL is unavailable');
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, PRINT_VERTEX], [gl.FRAGMENT_SHADER, PRINT_FRAGMENT]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(['photo', 'box', 'imageSize', 'grain', 'paper', 'inks']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(uniforms.photo, 0);
  gl.uniform3fv(uniforms.paper, RISO.paper);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);
  return { canvas, gl, uniforms };
}

// Prints a decoded photo as a riso, covering a box of `width` × `height` CSS
// pixels as `object-fit: cover` would. Returns a 2D canvas holding the print,
// or null where WebGL or the photo's pixels are unavailable.
export function printRiso(photo, width, height, dpr) {
  try {
    printer ??= createPrinter();
    const { canvas, gl, uniforms } = printer;
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo);
    gl.uniform2f(uniforms.box, w, h);
    gl.uniform2f(uniforms.imageSize, photo.naturalWidth, photo.naturalHeight);
    gl.uniform1f(uniforms.grain, Math.max(RISO.grain * dpr, 1));
    gl.uniform3fv(uniforms.inks, new Float32Array(inkPalette(photo).flat()));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const print = document.createElement('canvas');
    print.width = w; print.height = h;
    print.getContext('2d').drawImage(canvas, 0, 0);
    return print;
  } catch (error) {
    console.warn('Riso print unavailable; showing the photograph.', error);
    return null;
  }
}
