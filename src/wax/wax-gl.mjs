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
uniform float extension, peak, depth, gloss, detail;
out vec4 outColor;
const float ASPECT = ${WAX_ASPECT};
const float SPAN = ${WAX_ASPECT - 1};
// Where the end caps begin, the stretch eases over three source pixels
// (243 to 246 px from the centre), as it did on the approved mesh.
const float EASE_FROM = 243. / 280., EASE_TO = 246. / 280.;
float surface(vec2 uv) { return texture(relief, uv).b * peak * depth; }
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
  vec4 r = texture(relief, uv);
  vec3 base = texture(albedo, uv).rgb;
  vec2 slope = r.xy * 2. - 1.;
  vec3 n = normalize(vec3(slope.x * depth / stretch, slope.y * depth, sqrt(max(1. - dot(slope, slope), 0.))));
  float h = r.b * peak * depth;
  float cavity = mix(1., r.a, clamp(depth, 0., 1.));
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
  float shine = (pow(nh, gloss * mix(.35, 1., polish)) * 1.7 * polish + pow(nh, gloss * .18) * .22)
    * smoothstep(0., .2, facing) * shadow;
  vec3 colour = base * cavity * (.36 + .9 * diffuse)
    // Light carried through the wax: shaded wax stays a deep red, not grey.
    + base * base * .3 * (1. - shadow) * smoothstep(-.2, .4, facing)
    + vec3(1., .95, .92) * shine * (.6 + fresnel) * cavity;
  colour = mix(colour, source.rgb, detail);
  outColor = vec4(colour * source.a, source.a);
}`;

// The photo is the one the page already shows, so it costs no extra bytes.
export const WAX_ASSETS = ['/assets/works-wax-seal.webp', '/assets/wax-seal-albedo.webp', '/assets/wax-seal-relief.webp'];
// The relief's tallest point in seal heights, as build-wax-seal.py reports it.
export const WAX_RELIEF_PEAK = .0577;

let sharedAssets;
const fetchOK = async url => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wax asset ${response.status}: ${url}`);
  return response;
};
const assets = () => sharedAssets ??= Promise.all(WAX_ASSETS.map(url => fetchOK(url).then(r => r.blob())
  .then(blob => createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))))
  .catch(error => { sharedAssets = null; throw error; });

// Waits for the driver to finish compiling off the main thread, when it can.
function linked(gl, program) {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  if (!parallel) return Promise.resolve();
  return new Promise(resolve => {
    const check = () => gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR) ? resolve() : requestAnimationFrame(check);
    check();
  });
}

export class WaxGL {
  constructor(canvas) { this.canvas = canvas; this.resources = []; }
  async prepare() {
    const gl = this.gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error('WebGL 2 unavailable');
    const program = this.program = gl.createProgram();
    const shaders = [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]].map(([type, source]) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader); gl.attachShader(program, shader);
      return shader;
    });
    gl.linkProgram(program);
    const [images] = await Promise.all([assets(), linked(gl, program)]);
    if (this.disposed) return;
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(shaders.map(shader => gl.getShaderInfoLog(shader)).join('') || gl.getProgramInfoLog(program));
    shaders.forEach(shader => gl.deleteShader(shader));
    gl.useProgram(program);
    images.forEach((image, unit) => {
      const texture = gl.createTexture(); this.resources.push(texture);
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
    this.u = Object.fromEntries(['extension', 'aspect', 'photo', 'albedo', 'relief', 'light', 'peak', 'depth', 'gloss', 'detail']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    gl.uniform1i(this.u.photo, 0); gl.uniform1i(this.u.albedo, 1); gl.uniform1i(this.u.relief, 2);
    gl.uniform1f(this.u.peak, WAX_RELIEF_PEAK);
    this.onLost = event => { event.preventDefault(); this.ready = false; delete this.canvas.dataset.ready; };
    this.onRestore = () => { this.prepare().then(() => this.draw(this.last)).catch(() => {}); };
    this.canvas.addEventListener('webglcontextlost', this.onLost, { once: true });
    this.canvas.addEventListener('webglcontextrestored', this.onRestore, { once: true });
    this.ready = true;
  }
  // `light` is the point light's position in the seal's space.
  draw({ width = 768, height = 280, extension = 0, light = [-.8, .45, 1], depth = 1, gloss = 60, detail = 0 } = {}) {
    this.last = { width, height, extension, light, depth, gloss, detail };
    if (!this.ready || this.disposed) return;
    const gl = this.gl, u = this.u;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(u.extension, extension); gl.uniform1f(u.aspect, width / height);
    gl.uniform3f(u.light, ...light);
    gl.uniform1f(u.depth, depth); gl.uniform1f(u.gloss, gloss); gl.uniform1f(u.detail, detail);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.canvas.dataset.ready = 'true';
  }
  dispose() {
    this.disposed = true; this.ready = false;
    if (!this.gl) return;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestore);
    this.resources.forEach(t => this.gl.deleteTexture(t));
    this.gl.deleteProgram(this.program);
  }
}
