// One project's cover giving way to the next's, when the top bar's pill moves
// between projects: the photo breaks into a coarse dither, its dots turn over
// to the next photo one by one, in the dither's own order, and the dither
// fines away into it: a ring of dots growing out from the middle of the cover
// to its corners, its edge long and soft. A canvas laid over the cover's photo draws it, then
// leaves, as the PIN's reveal does (cover-reveal.mjs).
export const COVER_DITHER = Object.freeze({
  duration: 2200, // ms from the one photo to the other, eased
  coarsest: 4,    // CSS px, the dots at their largest, in the ring
  levels: [32, 4], // brightness steps, at either end and midway
  handover: 240,  // ms the clean canvas takes to fade into the photo beneath
  ring: .75,      // how wide the ring of dots is, against the whole way out
});

const VERTEX = `
precision highp float;
attribute vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;

// `progress` runs 0 to 1. Each photo is placed as object-fit: cover at its
// own focus. The dots grow toward the middle and shrink after; each dot shows
// the next photo once the turn reaches its place in the dither's order.
const FRAGMENT = `
precision highp float;
uniform sampler2D before, after;
uniform vec2 box, beforeSize, afterSize, beforeFocus, afterFocus;
uniform float progress, coarsest, levelsFine, levelsCoarse, ring;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

vec3 dither(vec3 rgb, vec2 c, float steps) {
  float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
  float stepped = min(1.0, floor(luma * steps + bayer8(c)) / steps);
  return stepped <= luma
    ? rgb * (luma > 0.0 ? stepped / luma : 0.0)
    : mix(rgb, vec3(1.0), (stepped - luma) / (1.0 - luma));
}

vec2 place(vec2 p, vec2 size, vec2 focus) {
  float scale = max(box.x / size.x, box.y / size.y);
  return (p - (box - size * scale) * focus) / scale / size;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, box.y - gl_FragCoord.y);
  // Each place's own moment, by its distance from the middle, the corners
  // at 1: the ring reaches the middle first. Taken on the grid of the
  // largest dots, which every smaller dot divides, so a dot never splits.
  float away = length((floor(p / coarsest) + 0.5) * coarsest - box * 0.5) / length(box * 0.5);
  float local = clamp((progress * (1.0 + ring) - away) / ring, 0.0, 1.0);
  // The dots grow toward the ring's middle and shrink after, in powers of two.
  float cell = pow(2.0, floor(log2(coarsest) * sin(local * 3.14159265) + 0.5));
  vec2 c = floor(p / cell);
  vec2 centre = (c + 0.5) * cell;
  bool turned = bayer8(c + vec2(3.0, 5.0)) < smoothstep(0.22, 0.78, local);
  vec3 rgb = turned ? texture2D(after, place(centre, afterSize, afterFocus)).rgb
    : texture2D(before, place(centre, beforeSize, beforeFocus)).rgb;
  float steps = floor(exp(mix(log(levelsFine), log(levelsCoarse), sin(local * 3.14159265))));
  vec3 dotted = dither(rgb, c, steps);
  vec3 clean = local < 0.5 ? texture2D(before, place(p, beforeSize, beforeFocus)).rgb
    : texture2D(after, place(p, afterSize, afterFocus)).rgb;
  float amount = smoothstep(0.0, 0.16, local) * (1.0 - smoothstep(0.84, 1.0, local));
  gl_FragColor = vec4(mix(clean, dotted, amount), 1.0);
}`;

function createRenderer(canvas) {
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
  const uniforms = Object.fromEntries(['before', 'after', 'box', 'beforeSize', 'afterSize', 'beforeFocus', 'afterFocus',
    'progress', 'coarsest', 'levelsFine', 'levelsCoarse', 'ring'].map(name => [name, gl.getUniformLocation(program, name)]));
  const upload = (unit, image) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  };
  gl.uniform1i(uniforms.before, 0);
  gl.uniform1i(uniforms.after, 1);
  return { gl, uniforms, upload };
}

// '50% 84%' as fractions; the centre for anything else.
const focusOf = position => {
  const [x = 50, y = 50] = (position.match(/-?[\d.]+(?=%)/g) ?? []).map(Number);
  return [x / 100, y / 100];
};
// Fast from the start, slowing to the end: the ring bursts out of the middle
// and settles into the corners.
const ease = t => 1 - (1 - t) ** 3;

// Lays the previous cover, `from` ({ src, focus }), over this page's cover
// `img`, ready to give way to it: `ready` resolves once it shows, and `run()`
// plays the dither, resolving once the canvas has left the photo clean.
// Where WebGL is unavailable, or for reduced motion, the photo is simply there.
export function coverDither(img, from, { reduced = false } = {}) {
  const plain = { ready: Promise.resolve(), run: () => Promise.resolve() };
  if (reduced) return plain;
  const canvas = Object.assign(document.createElement('canvas'), { className: 'cover-reveal' });
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = createRenderer(canvas);
  } catch (error) {
    console.warn('Cover dither unavailable; showing the photograph.', error);
    return plain;
  }
  const { gl, uniforms, upload } = renderer;
  // Once the canvas has gone, nothing draws on it again: its context and the
  // two photos it holds are let go of at once, not whenever the page next
  // collects its garbage.
  const release = () => gl.getExtension('WEBGL_lose_context')?.loseContext();
  // Over the photo exactly: its box, which overscans the stamp, to the
  // fraction of a pixel (offsetLeft and the like round it away).
  const place = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const box = img.getBoundingClientRect(), parent = img.parentElement.getBoundingClientRect();
    const { width, height } = box;
    Object.assign(canvas.style, { left: `${box.left - parent.left}px`, top: `${box.top - parent.top}px`, width: `${width}px`, height: `${height}px` });
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uniforms.box, w, h);
    // A power of two in device pixels, so the smaller dots divide it.
    gl.uniform1f(uniforms.coarsest, 2 ** Math.round(Math.log2(COVER_DITHER.coarsest * dpr)));
  };
  const draw = progress => {
    gl.uniform1f(uniforms.progress, progress);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const before = Object.assign(new Image(), { src: from.src });
  const ready = Promise.all([before.decode(), img.decode()]).then(() => {
    upload(0, before);
    upload(1, img);
    gl.uniform2f(uniforms.beforeSize, before.naturalWidth, before.naturalHeight);
    gl.uniform2f(uniforms.afterSize, img.naturalWidth, img.naturalHeight);
    gl.uniform2f(uniforms.beforeFocus, ...focusOf(from.focus));
    gl.uniform2f(uniforms.afterFocus, ...focusOf(getComputedStyle(img).objectPosition));
    gl.uniform1f(uniforms.levelsFine, COVER_DITHER.levels[0]);
    gl.uniform1f(uniforms.levelsCoarse, COVER_DITHER.levels[1]);
    gl.uniform1f(uniforms.ring, COVER_DITHER.ring);
    place();
    draw(0);
    img.after(canvas);
    addEventListener('resize', place);
  }).catch(error => {
    // A photo that cannot be read for the canvas is simply shown.
    console.warn('Cover dither unavailable; showing the photograph.', error);
    canvas.remove();
    release();
    return 'plain';
  });
  const run = () => ready.then(outcome => outcome === 'plain' ? undefined : new Promise(resolve => {
    let start;
    const step = now => {
      start ??= now;
      const t = Math.min(1, (now - start) / COVER_DITHER.duration);
      draw(ease(t));
      if (t < 1) { requestAnimationFrame(step); return; }
      // Clean now, it fades into the photo beneath rather than leaving it at
      // a stroke: the two are drawn by different hands, a hair apart.
      canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: COVER_DITHER.handover, easing: 'ease', fill: 'forwards' }).finished.finally(() => {
        removeEventListener('resize', place);
        canvas.remove();
        release();
        resolve();
      });
    };
    requestAnimationFrame(step);
  }));
  return { ready, run };
}
