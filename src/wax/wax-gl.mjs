import { WAX_ASPECT } from './wax-layout.mjs';

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
uniform sampler2D photo, albedo, relief;
uniform vec3 light;
uniform float extension, peak, depth, gloss, detail, level, sheen, pour, molten, press;
out vec4 outColor;
const float ASPECT = ${WAX_ASPECT};
const float SPAN = ${WAX_ASPECT - 1};
// Where the end caps begin, the stretch eases over three source pixels
// (243 to 246 px from the centre), as it did on the approved mesh.
const float EASE_FROM = 243. / 280., EASE_TO = 246. / 280.;
// While it forms (wax-pour.mjs), the lip rises as the wax cools and the
// middle, the inner ridge with it, as the stamp presses it.
float formed(float height) { return mix(press, 1. - molten, smoothstep(.24, .42, height)); }
float surface(vec2 uv) { float b = texture(relief, uv).b; return b * peak * depth * formed(b); }
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
  vec4 source = texture(photo, uv);
  if (source.a < .004 || any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) discard;
  // The pour spreads from the middle with a wavering front, to the outline.
  vec2 c = (uv - .5) * vec2(2);
  float angle = atan(c.y, c.x * ASPECT);
  float wave = (.05 * sin(angle * 5. + pour * 9.) + .03 * sin(angle * 9. - pour * 13.)) * (1. - pour);
  float front = pour * 1.3 - length(c) + wave;
  float reach = pour >= 1. ? 1. : smoothstep(0., .012, front);
  if (reach <= 0.) discard;
  vec4 r = texture(relief, uv);
  vec3 base = texture(albedo, uv).rgb;
  vec2 slope = r.xy * 2. - 1.;
  float shaped = depth * formed(r.b);
  vec3 n = normalize(vec3(slope.x * shaped / stretch, slope.y * shaped, sqrt(max(1. - dot(slope, slope), 0.))));
  float h = r.b * peak * shaped;
  float cavity = mix(1., r.a, clamp(shaped, 0., 1.));
  // The rolled lip is glossy; the pressed field is satin.
  float polish = mix(.3, 1., smoothstep(.24, .42, r.b));
  vec3 l = normalize(light - vec3(vPos, h));
  float shadow = 1.;
  vec2 step = vec2(l.x / (ASPECT * stretch), -l.y);
  for (int i = 1; i <= 24; i++) {
    float t = float(i) * .006;
    float above = h + l.z * t - surface(uv + step * t);
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
  // Molten: the wax glows a deeper, hotter red, and a thin bright bead runs
  // along the pour's rounded front.
  float bead = smoothstep(.004, .02, front) * (1. - smoothstep(.02, .06, front)) * molten * (1. - pour * pour);
  colour += base * vec3(.5, .05, .02) * molten + vec3(1., .78, .7) * bead * .6;
  colour = mix(colour, source.rgb, detail);
  outColor = vec4(colour * source.a * reach, source.a * reach);
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
let shared = null;
const renderer = () => shared ??= createRenderer().catch(error => { shared = null; throw error; });
async function createRenderer() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) throw new Error('WebGL 2 unavailable');
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    image.close?.();
  });
  const u = Object.fromEntries(['extension', 'aspect', 'photo', 'albedo', 'relief', 'light', 'peak', 'depth', 'gloss', 'detail', 'level', 'sheen', 'pour', 'molten', 'press']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(u.photo, 0); gl.uniform1i(u.albedo, 1); gl.uniform1i(u.relief, 2);
  gl.uniform1f(u.peak, WAX_RELIEF_PEAK);
  const state = { canvas, gl, u, views: new Set(), lost: false };
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
function render({ canvas, gl, u }, w, h, { width, height, extension, light, depth, gloss, detail, level, sheen, pour, molten, press }) {
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
  gl.uniform1f(u.pour, pour); gl.uniform1f(u.molten, molten); gl.uniform1f(u.press, press);
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
  // `pour`, `molten` and `press` play the entrance (wax-pour.mjs); left out,
  // the seal is formed.
  draw({ width = 768, height = 280, extension = 0, light = [-.8, .45, 1], depth = 1, gloss = 60, detail = 0, level = 1, sheen = 1,
    pour = 1, molten = 0, press = 1 } = {}) {
    this.last = { width, height, extension, light, depth, gloss, detail, level, sheen, pour, molten, press };
    if (!this.ready || this.disposed || this.renderer.lost) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    else this.context.clearRect(0, 0, w, h);
    const source = render(this.renderer, w, h, this.last);
    this.context.drawImage(this.renderer.canvas, ...source, 0, 0, w, h);
    this.canvas.dataset.ready = 'true';
  }
  dispose() {
    this.disposed = true; this.ready = false;
    this.renderer?.views.delete(this);
  }
}
