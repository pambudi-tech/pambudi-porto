import { DITHER } from '../works/dither.mjs';

// The full cover's arrival once the PIN is in: the photo as a coarse, stark
// dither whose dots shrink and whose brightness steps multiply until it is as
// fine as a screen can show, when the dither melts away into the photograph.
// A canvas laid over the cover's photo draws it, then leaves.
export const COVER_REVEAL = Object.freeze({
  duration: 3200,  // ms from the coarsest dither to the clean photo
  cellFrom: 8,     // CSS pixels per dot at the start
  levelsFrom: 2,   // brightness steps at the start
  levelsTo: 32,    // ... and as the dither gives way to the photo
  sharpen: .78,    // the share of the time the dots take to reach their finest
});

const VERTEX = `
precision highp float;
attribute vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;

// `progress` runs 0 to 1. Until `sharpen`, the dots shrink from `cellFrom` to
// `cellTo` device pixels, evenly to the eye, a whole pixel at a time, as the
// brightness steps multiply; after it, the finest dither fades to the photo.
const FRAGMENT = `
precision highp float;
uniform sampler2D photo;
uniform vec2 box, imageSize, focus;
uniform float progress, cellFrom, cellTo, levelsFrom, levelsTo, sharpen;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

// The photo at a box pixel, as object-fit: cover at the cover's focus.
vec3 photoAt(vec2 p) {
  float scale = max(box.x / imageSize.x, box.y / imageSize.y);
  vec2 offset = (box - imageSize * scale) * focus;
  return texture2D(photo, clamp((p - offset) / scale / imageSize, 0.0, 1.0)).rgb;
}

vec3 dither(vec3 rgb, vec2 c, float steps) {
  float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
  float stepped = min(1.0, floor(luma * steps + bayer8(c)) / steps);
  return stepped <= luma
    ? rgb * (luma > 0.0 ? stepped / luma : 0.0)
    : mix(rgb, vec3(1.0), (stepped - luma) / (1.0 - luma));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, box.y - gl_FragCoord.y);
  float detail = smoothstep(0.0, sharpen, progress);
  float cell = max(1.0, floor(exp(mix(log(cellFrom), log(cellTo), detail)) + 0.5));
  vec2 c = floor(p / cell);
  float steps = floor(exp(mix(log(levelsFrom), log(levelsTo), detail)));
  vec3 dotted = dither(photoAt((c + 0.5) * cell), c, steps);
  gl_FragColor = vec4(mix(dotted, photoAt(p), smoothstep(sharpen, 1.0, progress)), 1.0);
}`;

function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false, antialias: false });
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
  const uniforms = Object.fromEntries(['photo', 'box', 'imageSize', 'focus', 'progress', 'cellFrom', 'cellTo',
    'levelsFrom', 'levelsTo', 'sharpen'].map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(uniforms.photo, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);
  return { gl, uniforms };
}

// '50% 84%' as fractions; the centre for anything else.
const focusOf = position => {
  const [x = 50, y = 50] = (position.match(/-?[\d.]+(?=%)/g) ?? []).map(Number);
  return [x / 100, y / 100];
};

// Shows `full`, a decoded photo, in the cover's `img` with the sharpening
// dither's arrival. Resolves once the photo stands clean. Where WebGL is
// unavailable, or for reduced motion, the photo simply takes the preview's
// place.
export function revealCover(img, full, { reduced = false } = {}) {
  const swap = () => { img.src = full.src; };
  if (reduced) return Promise.resolve(swap());
  const canvas = Object.assign(document.createElement('canvas'), { className: 'cover-reveal' });
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = createRenderer(canvas);
  } catch (error) {
    console.warn('Cover reveal unavailable; showing the photograph.', error);
    return Promise.resolve(swap());
  }
  const { gl, uniforms } = renderer;
  const settings = COVER_REVEAL;
  // Over the photo exactly: its box, which overscans the stamp.
  const place = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const { offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height } = img;
    Object.assign(canvas.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uniforms.box, w, h);
    gl.uniform1f(uniforms.cellFrom, Math.round(settings.cellFrom * dpr));
    gl.uniform1f(uniforms.cellTo, Math.max(1, Math.round(DITHER.cell * dpr)));
  };
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, full);
  gl.uniform2f(uniforms.imageSize, full.naturalWidth, full.naturalHeight);
  gl.uniform2f(uniforms.focus, ...focusOf(getComputedStyle(img).objectPosition));
  gl.uniform1f(uniforms.levelsFrom, settings.levelsFrom);
  gl.uniform1f(uniforms.levelsTo, settings.levelsTo);
  gl.uniform1f(uniforms.sharpen, settings.sharpen);
  place();
  img.after(canvas);
  addEventListener('resize', place);

  return new Promise(resolve => {
    let start;
    const draw = now => {
      start ??= now;
      const progress = Math.min(1, (now - start) / settings.duration);
      gl.uniform1f(uniforms.progress, progress);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (progress === 1) {
        // Clean now, it matches the photo beneath, which it can leave to.
        removeEventListener('resize', place);
        canvas.remove();
        resolve();
        return;
      }
      // The photo takes the preview's place beneath, once the canvas covers it.
      if (img.src !== full.src) swap();
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
}
