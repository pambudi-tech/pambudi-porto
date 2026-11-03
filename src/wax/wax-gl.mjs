import { WAX_ASPECT } from './wax-layout.mjs';
import { hardwareWebGL2 } from '../shared/gpu.mjs';

// One flat card, no mesh: the seal is only seen from the front, its outline
// comes from the image's alpha and its depth from the baked relief. The
// card is in the seal's own space: x right, y up, one unit = its height.
const VERTEX = `#version 300 es
uniform float aspect;
out vec2 vPos;
void main() {
  vec2 corner = vec2(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1.);
  vPos = corner * vec2(aspect, 1) * .5;
  gl_Position = vec4(corner, 0, 1);
}`;

// Every pixel is lit live by one point light: wrapped diffuse for wax, a
// sharp and a broad gloss lobe, and shadows the relief casts on itself.
// The middle stretches to fit a label; the end caps stay rigid.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vPos;
uniform sampler2D photo, albedo, relief, letters;
uniform vec3 light;
uniform float extension, aspect, peak, depth, gloss, detail, level, sheen, spread, form, press, wet, stamp, pixel, seed, lettered;
out vec4 outColor;
const float ASPECT = ${WAX_ASPECT};
const float SPAN = ${WAX_ASPECT - 1};
// Where the end caps begin, the stretch eases over three source pixels
// (243 to 246 px from the centre), as it did on the approved mesh.
const float EASE_FROM = 243. / 280., EASE_TO = 246. / 280.;
// While it forms (wax-pour.mjs), the lip rolls up as the stamp squeezes the
// wax out, and the middle, the inner ridge with it, sinks as it presses.
float formed(float height) { return mix(press, form, smoothstep(.24, .42, height)); }
float surface(vec2 uv) { float b = texture(relief, uv).b; return b * peak * depth * formed(b); }
// The label's letters, raised from the field as an engraved stamp leaves
// them, from a height map of the seal's own size (wax-letters.mjs): firm
// shoulders and a flat top, standing well clear of the field.
const float LETTER = .024;
const vec3 INK = vec3(.718, .102, .125);
vec4 lettersAt(vec2 pos) { return texture(letters, vec2(pos.x / aspect + .5, .5 - pos.y)); }
float letterAt(vec2 pos) { return smoothstep(.06, .62, lettersAt(pos).r) * LETTER * lettered * form; }
// Each pour is its own: lobes run ahead or lag, and change as it spreads.
float hash(float n) { return fract(sin(n * 78.233) * 43758.5453); }
float reachAt(float a) {
  float r = 0.;
  for (int i = 0; i < 6; i++) {
    // Whole numbers of lobes, so the edge meets itself all the way round.
    float f = float(i), k = floor(2. + f * 1.6) + floor(hash(seed + f * 3.1) * 2.);
    float phase = hash(seed + f) * 6.283 + spread * (hash(seed + f * 7.7) - .5) * 9.;
    r += sin(k * a + phase) * .16 / (1. + f * .7);
  }
  // Busier while it runs, calmer as it slows; and quicker one way than another.
  float pace = mix(.7, 1.6, .5 + .5 * sin(2. * a + hash(seed + 9.) * 6.283));
  return pow(spread, pace) * (1. + r * mix(1., .45, spread));
}
void main() {
  float stretch = 1. + extension / SPAN, along = abs(vPos.x), x;
  float from = EASE_FROM * stretch, to = EASE_TO + extension * .5;
  if (along < from) x = along / stretch;
  else if (along < to) {
    float t = (along - from) / (to - from);
    x = mix(EASE_FROM, EASE_TO, t);
    stretch = mix(stretch, 1., t);
  } else {
    x = along - extension * .5;
    stretch = 1.;
  }
  vec2 uv = vec2(sign(vPos.x) * x / ASPECT + .5, .5 - vPos.y);
  // Before the stamp, a puddle with its own outline: poured a little off
  // the middle, flowing out unevenly, a glossy dome with a thick rounded rim,
  // rippling faintly while it still flows. Its slopes come from neighbouring
  // pixels.
  vec2 poured = (vec2(hash(seed + 11.), hash(seed + 12.)) - .5) * vec2(.3, .08) * (1. - .6 * spread);
  vec2 p = (uv - .5) * vec2(ASPECT, 1.) - poured;
  vec2 radii = vec2(1.02, .4);
  float local = max(reachAt(atan(p.y / radii.y, p.x / radii.x)), 1e-3);
  float e = length(p / radii) / local;
  float puddle = (1. - e) * radii.y * local;
  float poolHeight = .065 * (1. - exp(-max(puddle, 0.) / .028)) * (1. + .25 * (1. - e * e))
    + .0015 * sin(e * 22. - spread * 18.) * (1. - spread) * step(0., puddle);
  vec3 poolNormal = normalize(vec3(-dFdx(poolHeight), -dFdy(poolHeight), pixel));
  // The stamp squeezes it out to the seal's own outline (signed, in the
  // colour's alpha), which then gives way to the photograph's exact edge.
  float outline = (textureLod(albedo, uv, 0.).a - .5) * 80. / 280.;
  float edge = mix(puddle, outline, form);
  float alpha = mix(smoothstep(-pixel, pixel, edge), textureLod(photo, uv, 0.).a, smoothstep(.85, 1., form));
  if (alpha < .004 || any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) discard;
  vec4 source = textureLod(photo, uv, 0.);
  vec4 r = texture(relief, uv);
  // The puddle is plain wax; the stamp's impression brings the seal's colour.
  vec3 base = mix(textureLod(albedo, vec2(.5), 6.).rgb, textureLod(albedo, uv, 0.).rgb, form);
  vec2 slope = r.xy * 2. - 1.;
  float shaped = depth * formed(r.b);
  vec3 stamped = normalize(vec3(slope.x * shaped / stretch, slope.y * shaped, sqrt(max(1. - dot(slope, slope), 0.))));
  vec3 n = normalize(mix(poolNormal, stamped, form));
  float h = mix(poolHeight, r.b * peak * shaped, form);
  float cavity = mix(1., mix(1., r.a, clamp(shaped, 0., 1.)), form);
  float on = 0.;
  if (lettered > 0.) {
    vec2 rise = vec2(letterAt(vPos + vec2(pixel, 0)) - letterAt(vPos - vec2(pixel, 0)),
      letterAt(vPos + vec2(0, pixel)) - letterAt(vPos - vec2(0, pixel))) / (2. * pixel);
    n = normalize(vec3(n.xy / max(n.z, .2) - rise, 1.));
    h += letterAt(vPos);
    // The field is shaded where the letters stand on it, and the ink's
    // brighter red on their tops keeps the label legible at rest.
    vec4 map = lettersAt(vPos);
    on = smoothstep(.15, .5, map.r) * form;
    cavity *= 1. - .8 * map.g * (1. - on) * form;
    base = mix(base, INK * 1.22, on * .85);
  }
  // The rolled lip is glossy and the pressed field satin; melted, all of it
  // is wet.
  // The stamp smooths what it raises: the letters are as glossy as the lip.
  float polish = mix(max(mix(.3, 1., smoothstep(.24, .42, r.b)), on), 1., wet);
  vec3 l = normalize(light - vec3(vPos, h));
  float shadow = 1.;
  vec2 step = vec2(l.x / (ASPECT * stretch), -l.y);
  for (int i = 1; i <= 24; i++) {
    float t = float(i) * .006;
    float above = h + l.z * t - surface(uv + step * t) - (lettered > 0. ? letterAt(vPos + l.xy * t) : 0.);
    shadow = min(shadow, clamp(1. + above / (t * .3), 0., 1.));
  }
  float facing = dot(n, l);
  float diffuse = max((facing + .25) / 1.25, 0.) * shadow;
  vec3 halfway = normalize(l + vec3(0, 0, 1));
  float nh = max(dot(n, halfway), 0.);
  float fresnel = .04 + .96 * pow(1. - max(n.z, 0.), 5.);
  // A crisp highlight and the soft glow of the same lamp around it.
  float shine = (pow(nh, gloss * mix(.35, 1., polish)) * 1.7 * polish + pow(nh, gloss * .18) * .22 * sheen)
    * smoothstep(0., .2, facing) * shadow;
  // Level sets how strongly the wax answers the lamp, and sheen the soft
  // glow around its highlight: a room light from far off asks for less.
  vec3 colour = (base * cavity * (.36 + .9 * diffuse)
    // Light carried through the wax: shaded wax stays a deep red, not grey.
    + base * base * .3 * (1. - shadow) * smoothstep(-.2, .4, facing)) * level
    + vec3(1., .95, .92) * shine * (.6 + fresnel) * cavity;
  // The stamp overhead shades the wax, its shadow a little away from the lamp.
  vec2 away = -normalize(light.xy + 1e-5) * .1;
  float under = 1. - smoothstep(.45, 1.1, length((uv - .5) * 2. - vec2(away.x / ASPECT, -away.y)));
  colour *= 1. - stamp * .5 * under;
  colour = mix(colour, source.rgb, detail);
  outColor = vec4(colour * alpha, alpha);
}`;

// The photo is the one the page already shows, so it costs no extra bytes.
export const WAX_ASSETS = ['/assets/works-wax-seal.webp', '/assets/wax-seal-albedo.webp', '/assets/wax-seal-relief.webp'];
// The relief's tallest point in seal heights, as build-wax-seal.py reports it.
export const WAX_RELIEF_PEAK = .0577;

const fetchOK = async url => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wax asset ${response.status}: ${url}`);
  return response;
};
const assets = () => Promise.all(WAX_ASSETS.map(url => fetchOK(url).then(r => r.blob())
  .then(blob => createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))));

// Waits for the driver to finish compiling off the main thread, when it can.
// A timer, not animation frames, so a tab in the background finishes too.
function linked(gl, program) {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  if (!parallel) return Promise.resolve();
  return new Promise(resolve => {
    const check = () => gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR) ? resolve() : setTimeout(check, 16);
    check();
  });
}

// One WebGL context draws every seal on the page and each seal copies its
// picture into its own canvas, so a gallery of seals costs the browser a
// single context and one upload of the textures.
// Without a graphics card it stays without one, so every seal hears that from
// one attempt; anything else is tried afresh.
let shared = null;
const renderer = () => shared ??= createRenderer().catch(error => { if (!error.lasting) shared = null; throw error; });
async function createRenderer() {
  const canvas = document.createElement('canvas');
  // Only on a graphics card; otherwise the seal keeps its photograph's relief.
  const gl = hardwareWebGL2(canvas, { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) throw Object.assign(new Error('WebGL 2 on a graphics card unavailable'), { lasting: true });
  const program = gl.createProgram();
  const shaders = [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]].map(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader); gl.attachShader(program, shader);
    return shader;
  });
  gl.linkProgram(program);
  const [images] = await Promise.all([assets(), linked(gl, program)]);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(shaders.map(shader => gl.getShaderInfoLog(shader)).join('') || gl.getProgramInfoLog(program));
  shaders.forEach(shader => gl.deleteShader(shader));
  gl.useProgram(program);
  images.forEach((image, unit) => {
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    // The colour's smaller levels give the puddle its plain wax; otherwise
    // every texture is read at full size.
    if (unit === 1) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, unit === 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    image.close?.();
  });
  const u = Object.fromEntries(['extension', 'aspect', 'photo', 'albedo', 'relief', 'light', 'peak', 'depth', 'gloss', 'detail', 'level', 'sheen', 'spread', 'form', 'press', 'wet', 'stamp', 'pixel', 'seed', 'letters', 'lettered']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(u.photo, 0); gl.uniform1i(u.albedo, 1); gl.uniform1i(u.relief, 2); gl.uniform1i(u.letters, 3);
  // Seals without letters read an empty map.
  gl.activeTexture(gl.TEXTURE3);
  const blank = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.uniform1f(u.peak, WAX_RELIEF_PEAK);
  const state = { canvas, gl, u, blank, views: new Set(), lost: false };
  // A lost context leaves every seal's last picture in place; a fresh
  // renderer redraws them once the browser allows WebGL again.
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    state.lost = true;
    if (shared) shared = null;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    for (const view of state.views) view.prepare().then(() => view.draw(view.last), () => {});
  });
  return state;
}

// Draws one seal at its size in the shared context, from the bottom left,
// and returns that corner of the drawing buffer.
function render({ canvas, gl, u }, w, h, { width, height, extension, light, depth, gloss, detail, level, sheen, spread, form, press, wet, stamp, seed }, letters) {
  // The buffer only grows, so seals of different sizes never reallocate it.
  if (canvas.width < w || canvas.height < h) {
    canvas.width = Math.max(canvas.width, w);
    canvas.height = Math.max(canvas.height, h);
  }
  gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(u.extension, extension); gl.uniform1f(u.aspect, width / height);
  gl.uniform3f(u.light, ...light);
  gl.uniform1f(u.depth, depth); gl.uniform1f(u.gloss, gloss); gl.uniform1f(u.detail, detail);
  gl.uniform1f(u.level, level); gl.uniform1f(u.sheen, sheen);
  gl.uniform1f(u.spread, spread); gl.uniform1f(u.form, form); gl.uniform1f(u.press, press);
  gl.uniform1f(u.wet, wet); gl.uniform1f(u.stamp, stamp); gl.uniform1f(u.pixel, 1 / h); gl.uniform1f(u.seed, seed);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, letters);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return [0, canvas.height - h, w, h];
}

// One seal's picture, in its own canvas on the page.
export class WaxGL {
  constructor(canvas) { this.canvas = canvas; }
  async prepare() {
    const state = await renderer();
    if (this.disposed) return;
    this.renderer?.views.delete(this);
    this.renderer = state;
    state.views.add(this);
    this.context ??= this.canvas.getContext('2d');
    this.ready = true;
  }
  // `light` is the point light's position in the seal's space.
  // The label's letters, as a height map the seal's size (wax-letters.mjs),
  // raised in the wax; null leaves the field plain.
  setLetters(map) {
    this.letters = map;
    this.lettersChanged = true;
  }
  lettersTexture() {
    const { gl, blank } = this.renderer;
    if (!this.letters) return blank;
    if (this.lettersFor !== this.renderer) { this.texture = gl.createTexture(); this.lettersFor = this.renderer; this.lettersChanged = true; }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (this.lettersChanged) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.letters);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.lettersChanged = false;
    }
    return this.texture;
  }
  // `spread`, `form`, `press`, `wet` and `stamp` play the entrance
  // (wax-pour.mjs), its puddle shaped by `seed`; left out, the seal is
  // formed and set.
  draw({ width = 768, height = 280, extension = 0, light = [-.8, .45, 1], depth = 1, gloss = 60, detail = 0, level = 1, sheen = 1,
    spread = 1, form = 1, press = 1, wet = 0, stamp = 0, seed = 0 } = {}) {
    this.last = { width, height, extension, light, depth, gloss, detail, level, sheen, spread, form, press, wet, stamp, seed };
    if (!this.ready || this.disposed || this.renderer.lost) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    else this.context.clearRect(0, 0, w, h);
    const letters = this.lettersTexture();
    this.renderer.gl.uniform1f(this.renderer.u.lettered, this.letters ? 1 : 0);
    const source = render(this.renderer, w, h, this.last, letters);
    this.context.drawImage(this.renderer.canvas, ...source, 0, 0, w, h);
    this.canvas.dataset.ready = 'true';
  }
  dispose() {
    this.disposed = true; this.ready = false;
    this.renderer?.views.delete(this);
  }
}
