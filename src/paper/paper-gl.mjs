import { FRAME_REGISTRATION } from './frame-registration.mjs';
import { hardwareWebGL2 } from '../shared/gpu.mjs';

// The paper lit as a surface: the paper model's baked relief normals on one
// quad, cut to the sheet's outline. A point light follows the pointer, and
// slopes and the relief's own short shadows are worked out per pixel. Same
// interface as PaperMaterial, which stays the fallback without WebGL 2.

// The model's relief image covers its card: the traced frame and this many
// SVG units of paper around it (measured against the frame's edges).
export const RELIEF_MARGIN = Object.freeze({ x: 47, y: 50 });

// Each face's relief, flat paper colour (sampled from its photograph) and
// where its emboss sits in that photograph: the red back's is pressed 2 px
// right and 8 px higher than the registration.
export const PAPER_FACES = Object.freeze({
  white: { relief: '/assets/paper-front-relief.webp', colour: [232.7, 232.6, 232], offset: [0, 0] },
  red: { relief: '/assets/paper-back-relief.webp', colour: [186.7, 42.6, 46.3], offset: [2, -8] },
});

export const PAPER_LIGHT = Object.freeze({
  rest: [-.22, -.42, 1.25], reach: .55, height: .6,
  relief: 1, contrast: .8, shadow: 1, shadowLength: 1.6,
});

// The relief image's box within the paper image, as fractions of it.
export function reliefRect([dx, dy] = [0, 0]) {
  const r = FRAME_REGISTRATION, unit = r.width / 1028;
  const mx = RELIEF_MARGIN.x * unit, my = RELIEF_MARGIN.y * unit;
  return [(r.x - mx + dx) / r.paperWidth, (r.y - my + dy) / r.paperHeight,
    (r.width + 2 * mx) / r.paperWidth, (r.height + 2 * my) / r.paperHeight];
}

// Where the light sits for a pose: resting above the upper left, moving to
// the pointer, lower and closer, as the hover's `light` rises.
export function lightPosition({ lx = 0, ly = 0, light = 0 }, aspect) {
  const target = [lx * PAPER_LIGHT.reach * aspect, ly * PAPER_LIGHT.reach, PAPER_LIGHT.height];
  return PAPER_LIGHT.rest.map((value, i) => value + (target[i] - value) * light);
}

const VERTEX = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = vec2(position.x * .5 + .5, .5 - position.y * .5);
  gl_Position = vec4(position, 0., 1.);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uReliefMap, uMask;
uniform vec3 uLight, uColour;
uniform vec4 uRect;
uniform vec2 uTexel;
uniform float uAspect, uRelief, uContrast, uShadow, uShadowLength;
out vec4 outColor;

// Baked tangent-space normals (OpenGL, y up) turned to the sheet's frame
// (y down). Outside the model's card the page's wider margin is flat.
vec3 normalAt(vec2 uv) {
  vec2 q = (uv - uRect.xy) / uRect.zw;
  if (any(lessThan(q, vec2(0.))) || any(greaterThan(q, vec2(1.)))) return vec3(0., 0., 1.);
  vec3 n = texture(uReliefMap, q).xyz * 2. - 1.;
  n.y = -n.y;
  n.xy *= uRelief;
  return normalize(n);
}

// The sheet's grain, like PaperMaterial's: fine mottling and longer fibres
// fixed to the paper, 896 cells across.
float hash(vec2 p) {
  p = fract(p * vec2(.1031, .1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x) - .5;
}
float grain(vec2 uv) {
  vec2 cell = floor(uv * vec2(896., 896. / uAspect));
  return (hash(cell) * 7. + hash(floor(vec2((cell.x + cell.y * .12) / 2., cell.y / 7.)) + 91.) * 4.) / 255.;
}

void main() {
  float alpha = texture(uMask, vUv).a;
  if (alpha < .004) discard;
  vec3 p = vec3((vUv.x - .5) * uAspect, vUv.y - .5, 0.);
  vec3 toLight = uLight - p, l = normalize(toLight);
  vec3 n = normalAt(vUv);

  // Walk toward the light, rebuilding the relief's height from its slopes;
  // where it rises above the light's ray this point lies in its shadow.
  vec2 dir = normalize(l.xy + 1e-5);
  float tanElevation = l.z / max(length(l.xy), 1e-3);
  vec2 stepUv = vec2(dir.x / uAspect, dir.y) * uTexel.y * uRect.w;
  float height = 0., shadow = 0.;
  for (int i = 1; i <= 14; i++) {
    vec3 m = normalAt(vUv + stepUv * float(i));
    height += -dot(m.xy, dir) / max(m.z, .2) * uShadowLength;
    shadow = max(shadow, clamp((height - float(i) * tanElevation) / .6, 0., 1.));
  }
  shadow *= uShadow;

  // Matte paper measured against flat paper under the same light: flat areas
  // keep the sheet's colour, the relief answers the light, and a gentle
  // gradient crosses the sheet.
  float wrap = .25;
  float flatLit = (l.z + wrap) / (1. + wrap);
  float diffuse = max((dot(n, l) + wrap) / (1. + wrap), 0.) * (1. - shadow);
  float falloff = 1. / (1. + dot(toLight, toLight) * .9);
  float centre = 1. / (1. + dot(uLight, uLight) * .9);
  float broad = clamp((falloff / centre - 1.) * .18, -.09, .06);
  float shade = 1. + (diffuse - flatLit) / flatLit * uContrast + broad;
  vec3 colour = (uColour + grain(vUv)) * shade;
  outColor = vec4(colour * alpha, alpha);
}`;

// Status is read only once compiling has finished, so asking never stalls
// the page while the GPU process (or a software renderer) is still busy.
function linked(gl, program, shaders) {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  return new Promise((resolve, reject) => {
    const check = () => {
      if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) { requestAnimationFrame(check); return; }
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) resolve();
      else reject(new Error(shaders.map(shader => gl.getShaderInfoLog(shader)).join('\n') || gl.getProgramInfoLog(program)));
    };
    requestAnimationFrame(check);
  });
}

const idle = () => new Promise(resolve => (window.requestIdleCallback
  ? requestIdleCallback(resolve, { timeout: 2000 }) : setTimeout(resolve, 200)));

export class PaperGL {
  constructor(image, face) {
    this.image = image;
    this.face = PAPER_FACES[face];
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'paper-material paper-gl';
    this.canvas.setAttribute('aria-hidden', 'true');
  }
  // Rejects when WebGL 2 is unavailable or fails, before the canvas is shown.
  async prepare() {
    // After the page has settled: nothing here may hold up its first paint.
    await idle();
    // Only on a graphics card; otherwise the photograph's own relief (PaperMaterial).
    const gl = hardwareWebGL2(this.canvas, { premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error('WebGL 2 on a graphics card unavailable');
    this.gl = gl;
    const program = gl.createProgram();
    const shaders = [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]].map(([type, source]) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
      return shader;
    });
    gl.bindAttribLocation(program, 0, 'position');
    gl.linkProgram(program);
    const relief = fetch(this.face.relief).then(response => {
      if (!response.ok) throw new Error(`Paper relief: ${response.status}`);
      return response.blob();
    }).then(blob => createImageBitmap(blob));
    const [reliefImage] = await Promise.all([relief, linked(gl, program, shaders), this.image.decode()]);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.texture(0, reliefImage);
    this.texture(1, this.image);
    const u = this.uniforms = Object.fromEntries(['uReliefMap', 'uMask', 'uLight', 'uColour', 'uRect', 'uTexel', 'uAspect',
      'uRelief', 'uContrast', 'uShadow', 'uShadowLength'].map(name => [name, gl.getUniformLocation(program, name)]));
    // The master's shape: with srcset, natural sizes are divided by the chosen density.
    this.aspect = this.image.getAttribute('width') / this.image.getAttribute('height');
    gl.uniform1i(u.uReliefMap, 0);
    gl.uniform1i(u.uMask, 1);
    gl.uniform3f(u.uColour, ...this.face.colour.map(value => value / 255));
    gl.uniform4f(u.uRect, ...reliefRect(this.face.offset));
    gl.uniform2f(u.uTexel, 1 / reliefImage.width, 1 / reliefImage.height);
    gl.uniform1f(u.uAspect, this.aspect);
    gl.uniform1f(u.uRelief, PAPER_LIGHT.relief);
    gl.uniform1f(u.uContrast, PAPER_LIGHT.contrast);
    gl.uniform1f(u.uShadow, PAPER_LIGHT.shadow);
    gl.uniform1f(u.uShadowLength, PAPER_LIGHT.shadowLength);
    reliefImage.close?.();
    // A lost context leaves the photograph showing, as before WebGL started.
    this.canvas.addEventListener('webglcontextlost', () => { this.lost = true; delete this.canvas.dataset.materialReady; });
    // Its displayed size, read once now and again as layout settles, never in
    // a draw: there it would force the pose just written through layout again.
    this.size = [this.image.offsetWidth, this.image.offsetHeight];
    new ResizeObserver(() => {
      this.size = [this.image.offsetWidth, this.image.offsetHeight];
      this.draw(this.last ?? {});
    }).observe(this.image);
    this.ready = true;
    this.draw(this.last ?? {});
    this.image.after(this.canvas);
    // Settle its hidden style first, so it fades in over the photograph.
    getComputedStyle(this.canvas).opacity;
    this.canvas.dataset.materialReady = 'true';
  }
  texture(unit, image) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
  draw(values) {
    this.last = values;
    if (!this.ready || this.lost) return;
    // Drawn at the sheet's displayed size, up to two device pixels per CSS pixel.
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(this.size[0] * ratio), height = Math.round(this.size[1] * ratio);
    if (!width || !height) return;
    const position = lightPosition(values, this.aspect);
    const key = [...position, width].map(n => n.toFixed(4)).join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform3f(this.uniforms.uLight, ...position);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
