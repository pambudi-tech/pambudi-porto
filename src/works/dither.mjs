// Dithers the works photos in their own colours. Each cell of the photo keeps
// its hue; only its brightness steps between a few levels through an 8×8
// Bayer pattern, darkening toward black or lightening toward white, so the
// dither shows as texture without a palette.
//
// Each photo is dithered once, at its card's size, into an ordinary image the
// card shows, so it slides, tilts and flies with the card like any photo.

export const DITHER = Object.freeze({
  cell: 1,     // CSS pixels per dither dot
  levels: 6,   // brightness steps between black and white
});

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

const FRAGMENT = `
precision highp float;
uniform sampler2D photo;
uniform vec2 box, imageSize;
uniform float cell, levels;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  // Box pixels, top down, gathered into dither cells.
  vec2 p = vec2(gl_FragCoord.x, box.y - gl_FragCoord.y);
  vec2 c = floor(p / cell);
  // The photo covers the box as object-fit: cover does, sampled once per cell.
  float scale = max(box.x / imageSize.x, box.y / imageSize.y);
  vec3 rgb = texture2D(photo, ((c + 0.5) * cell - box * 0.5) / scale / imageSize + 0.5).rgb;
  float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
  float stepped = min(1.0, floor(luma * levels + bayer8(c)) / levels);
  vec3 shade = stepped <= luma
    ? rgb * (luma > 0.0 ? stepped / luma : 0.0)
    : mix(rgb, vec3(1.0), (stepped - luma) / (1.0 - luma));
  gl_FragColor = vec4(shade, 1.0);
}`;

let ditherer;

function createDitherer() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL is unavailable');
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
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
  const uniforms = Object.fromEntries(['photo', 'box', 'imageSize', 'cell', 'levels']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(uniforms.photo, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);
  return { canvas, gl, uniforms };
}

// Dithers a decoded photo to cover a box of `width` × `height` CSS pixels as
// `object-fit: cover` would. Returns a canvas holding the result, or null
// where WebGL or the photo's pixels are unavailable.
export function ditherPhoto(photo, width, height, dpr) {
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
    gl.uniform1f(uniforms.cell, Math.max(1, Math.round(DITHER.cell * dpr)));
    gl.uniform1f(uniforms.levels, DITHER.levels);
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
