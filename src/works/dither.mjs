// Dithers the works photos in their own colours. Each cell of the photo keeps
// its hue; only its brightness steps between a few levels through an 8×8
// Bayer pattern, darkening toward black or lightening toward white, so the
// dither shows as texture without a palette.
//
// Each photo is dithered once, at its card's size, into an ordinary image the
// card shows, so it slides, tilts and flies with the card like any photo. A
// hovered card also glitches (createGlitch): the same dither, drawn live,
// with some of its tiles shown out of place.

export const DITHER = Object.freeze({
  cell: .5,    // CSS pixels per dither dot: one device pixel on a 2× screen
  levels: 8,   // brightness steps between black and white
});

// Passcode-protected work, before the visitor has the PIN: its preview is
// already this dither, baked coarse (tools/locked-preview.py), so the card
// keeps its dots nearly as they are.
export const DITHER_LOCKED = Object.freeze({ cell: .5, levels: 16 });

// A card's glitch as the pointer moves over it: its window cut into
// `columns` × `rows` tiles, of which those within `reach` tiles of the pointer
// may show a neighbouring tile's piece of the photo instead, likeliest
// (`share`) right under it. It reshuffles at most every `interval`
// milliseconds and settles `settle` milliseconds after the pointer stops.
export const GLITCH = Object.freeze({ columns: 16, rows: 12, share: .6, reach: 7, interval: 60, settle: 160 });

const LUMA = [.299, .587, .114];

// The 8×8 ordered-dither threshold at a cell, from 0 up to 63/64. The same
// recursive formula as the shader's bayer8().
export function bayer8(x, y) {
  const bayer2 = (a, b) => {
    const fx = Math.floor(a), fy = Math.floor(b);
    return ((fx / 2 + fy * fy * .75) % 1 + 1) % 1;
  };
  const bayer4 = (a, b) => bayer2(a / 2, b / 2) * .25 + bayer2(a, b);
  return bayer4(x / 2, y / 2) * .25 + bayer2(x, y);
}

// One dot: the colour at its brightness step. Mirrors the shader, for tests.
export function ditherColor(rgb, x, y, levels = DITHER.levels) {
  const luma = rgb.reduce((sum, value, i) => sum + value * LUMA[i], 0);
  const stepped = Math.min(1, Math.floor(luma * levels + bayer8(x, y)) / levels);
  if (stepped <= luma) return luma > 0 ? rgb.map(value => value * stepped / luma) : [0, 0, 0];
  const toWhite = (stepped - luma) / (1 - luma);
  return rgb.map(value => value + (1 - value) * toWhite);
}

const VERTEX = `
precision highp float;
attribute vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;

// The dither both shaders share: a box pixel's dot, `cell` device pixels wide.
const DITHER_GLSL = `
precision highp float;
uniform sampler2D photo;
uniform vec2 box, imageSize;
uniform float cell, levels;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

vec3 dither(vec2 p, float size, float steps) {
  // Box pixels gathered into dither cells.
  vec2 c = floor(p / size);
  // The photo covers the box as object-fit: cover does, sampled once per cell.
  float scale = max(box.x / imageSize.x, box.y / imageSize.y);
  vec3 rgb = texture2D(photo, ((c + 0.5) * size - box * 0.5) / scale / imageSize + 0.5).rgb;
  float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
  float stepped = min(1.0, floor(luma * steps + bayer8(c)) / steps);
  return stepped <= luma
    ? rgb * (luma > 0.0 ? stepped / luma : 0.0)
    : mix(rgb, vec3(1.0), (stepped - luma) / (1.0 - luma));
}`;

const FRAGMENT = `${DITHER_GLSL}
void main() {
  // Box pixels, top down.
  gl_FragColor = vec4(dither(vec2(gl_FragCoord.x, box.y - gl_FragCoord.y), cell, levels), 1.0);
}`;

// The glitch: the photo's window in tiles; where a tile's hash falls under its
// chance (`share`, fading to none `reach` tiles from the pointer), it shows the
// tile up to two columns and one row away instead. Every other pixel is
// exactly FRAGMENT's dither.
const GLITCH_FRAGMENT = `${DITHER_GLSL}
uniform vec2 viewOrigin, viewSize, grid, pointer;
uniform float seed, share, reach;

float hash(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233)) + seed) * 43758.5453); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, box.y - gl_FragCoord.y);
  vec2 tileSize = viewSize / grid;
  vec2 tile = floor((p - viewOrigin) / tileSize);
  float near = length(((tile + 0.5) * tileSize + viewOrigin - pointer) / tileSize);
  if (hash(tile) < share * (1.0 - smoothstep(0.0, reach, near))) {
    vec2 jump = floor(vec2(hash(tile + 17.0), hash(tile + 31.0)) * vec2(5.0, 3.0)) - vec2(2.0, 1.0);
    if (jump.x == 0.0 && jump.y == 0.0) jump.x = 1.0;
    p = clamp(p + jump * tileSize, vec2(0.0), box - 1.0);
  }
  gl_FragColor = vec4(dither(p, cell, levels), 1.0);
}`;

let ditherer;

function createDitherer(fragment = FRAGMENT, extra = []) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL is unavailable');
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(['photo', 'box', 'imageSize', 'cell', 'levels', ...extra]
    .map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(uniforms.photo, 0);
  createTexture(gl);
  return { canvas, gl, uniforms };
}

function createTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);
  return texture;
}

// Dithers a decoded photo to cover a box of `width` × `height` CSS pixels as
// `object-fit: cover` would, with DITHER's dots unless told otherwise.
// Returns a canvas holding the result, or null where WebGL or the photo's
// pixels are unavailable.
export function ditherPhoto(photo, width, height, dpr, { cell = DITHER.cell, levels = DITHER.levels } = {}) {
  try {
    ditherer ??= createDitherer();
    const { canvas, gl, uniforms } = ditherer;
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo);
    gl.uniform2f(uniforms.box, w, h);
    gl.uniform2f(uniforms.imageSize, photo.naturalWidth, photo.naturalHeight);
    gl.uniform1f(uniforms.cell, Math.max(1, Math.round(cell * dpr)));
    gl.uniform1f(uniforms.levels, levels);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const result = document.createElement('canvas');
    result.width = w;
    result.height = h;
    result.getContext('2d').drawImage(canvas, 0, 0);
    return result;
  } catch (error) {
    console.warn('Dither unavailable; showing the photograph.', error);
    return null;
  }
}

// The glitch: one canvas, moved into whichever card is hovered, that redraws
// the card's photo with some tiles near the pointer out of place. Each photo is uploaded once.
// Returns null where WebGL is unavailable.
export function createGlitch() {
  try {
    const { canvas, gl, uniforms } = createDitherer(GLITCH_FRAGMENT, ['viewOrigin', 'viewSize', 'grid', 'pointer', 'seed', 'share', 'reach']);
    const textures = new WeakMap();
    let scale = 1;
    return {
      canvas,
      // Readies the glitch over a photo shown at `width` × `height` CSS
      // pixels, dithered as its card is.
      show(photo, width, height, dpr, { cell = DITHER.cell, levels = DITHER.levels } = {}) {
        scale = dpr;
        const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        gl.viewport(0, 0, w, h);
        if (textures.has(photo)) gl.bindTexture(gl.TEXTURE_2D, textures.get(photo));
        else {
          textures.set(photo, createTexture(gl));
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo);
        }
        gl.uniform2f(uniforms.box, w, h);
        gl.uniform2f(uniforms.imageSize, photo.naturalWidth, photo.naturalHeight);
        gl.uniform1f(uniforms.cell, Math.max(1, Math.round(cell * dpr)));
        gl.uniform1f(uniforms.levels, levels);
        gl.uniform2f(uniforms.grid, GLITCH.columns, GLITCH.rows);
        gl.uniform1f(uniforms.share, GLITCH.share);
        gl.uniform1f(uniforms.reach, GLITCH.reach);
      },
      // Draws one shuffle around `pointer`. It and `view`, the window the
      // tiles divide, are in CSS pixels within the photo.
      draw(view, pointer, seed) {
        gl.uniform2f(uniforms.viewOrigin, view.x * scale, view.y * scale);
        gl.uniform2f(uniforms.pointer, pointer.x * scale, pointer.y * scale);
        gl.uniform2f(uniforms.viewSize, view.width * scale, view.height * scale);
        gl.uniform1f(uniforms.seed, seed);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  } catch (error) {
    console.warn('Glitch unavailable.', error);
    return null;
  }
}
