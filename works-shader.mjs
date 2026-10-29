// Draws every works photo through one WebGL canvas as a risograph print:
// five inks, taken from the photo's own five strongest colours, each laid as
// its own grainy layer and overprinted, in register, on cream paper with
// fibres and specks. Hovered, the print dissolves into the
// smooth photograph.
//
// Each card's print is made once into a texture, at the card's size;
// scrolling then only slides that print inside its window, so a frame costs
// two texture reads per pixel.

export const RISO = Object.freeze({
  inks: 5,
  paper: [.97, .94, .88],      // cream
  grain: .8,                   // CSS pixels per grain of ink
  // The photo covers a box this much wider than the card, so it can slide
  // sideways with the scroll.
  overscan: 1.32,
});

// The photo's strongest colours as riso inks: frequent colours first, kept
// apart from each other, refined, then brightened as riso inks are, and
// ordered dark to light.
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
uniform vec3 inks[5];

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
  for (int j = 0; j < 5; j++) {
    vec3 d = rgb - inks[j];
    total += exp(-dot(d, d) * 22.0);
  }
  // One draw per pixel, from a fine grain with a little clumping.
  float draw = mix(hash(floor(p / grain)), noise(p / (grain * 2.5)), .4) * total;
  vec3 ink = vec3(1.0);
  float reached = paperWeight;
  bool chosen = draw < reached;
  for (int j = 0; j < 5; j++) {
    vec3 d = rgb - inks[j];
    reached += exp(-dot(d, d) * 22.0);
    if (!chosen && draw < reached) { ink = inks[j]; chosen = true; }
  }
  // Ink lies a little unevenly across the sheet.
  float strength = .86 + .1 * noise(p / (grain * 40.0));
  print *= mix(vec3(1.0), ink, strength);
  gl_FragColor = vec4(print, 1.0);
}`;

const SHOW_VERTEX = `
precision highp float;
attribute vec2 corner;
uniform vec4 rect;        // x, y, width, height in device pixels
uniform vec2 screen;
void main() {
  vec2 p = rect.xy + corner * rect.zw;
  gl_Position = vec4(p / screen * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}`;

// Shows a card's photo: its riso print slid by the parallax, filling the window,
// fading into the smooth photograph as it is hovered.
const SHOW_FRAGMENT = `
precision highp float;
uniform sampler2D photo, print;
uniform vec4 rect;        // the photo's window, device pixels
uniform vec2 imageSize, screen;
uniform vec2 parallax;    // device pixels
uniform float colour, appear, overscan;

void main() {
  vec2 frag = vec2(gl_FragCoord.x, screen.y - gl_FragCoord.y);

  vec2 box = vec2(rect.z * overscan, rect.w);
  vec2 p = frag - (rect.xy + rect.zw * .5 + parallax - box * .5);
  vec3 printed = texture2D(print, vec2(p.x / box.x, 1.0 - p.y / box.y)).rgb;
  float scale = max(box.x / imageSize.x, box.y / imageSize.y);
  vec3 photograph = texture2D(photo, (p - box * .5) / scale / imageSize + .5).rgb;

  float alpha = appear;
  gl_FragColor = vec4(mix(printed, photograph, colour) * alpha, alpha);
}`;

export class PhotoRiso {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) throw new Error('WebGL is unavailable');
    this.gl = gl;
    this.printer = this.program(PRINT_VERTEX, PRINT_FRAGMENT, ['photo', 'box', 'imageSize', 'grain', 'paper', 'inks']);
    this.shower = this.program(SHOW_VERTEX, SHOW_FRAGMENT,
      ['photo', 'print', 'rect', 'imageSize', 'screen', 'parallax', 'colour', 'appear', 'overscan']);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.use(this.printer);
    gl.uniform3fv(this.printer.uniforms.paper, RISO.paper);
    gl.uniform1i(this.printer.uniforms.photo, 0);
    this.use(this.shower);
    gl.uniform1i(this.shower.uniforms.photo, 0);
    gl.uniform1i(this.shower.uniforms.print, 1);
    gl.uniform1f(this.shower.uniforms.overscan, RISO.overscan);
    this.photos = new Map();
    this.prints = new Map();
  }

  program(vertex, fragment, names) {
    const gl = this.gl, program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return { program, corner: gl.getAttribLocation(program, 'corner'),
      uniforms: Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)])) };
  }

  use(stage) {
    const gl = this.gl;
    gl.useProgram(stage.program);
    gl.enableVertexAttribArray(stage.corner);
    gl.vertexAttribPointer(stage.corner, 2, gl.FLOAT, false, 0, 0);
  }

  resize(width, height, dpr) {
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  texture(source, filter) {
    const gl = this.gl, texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, filter], [gl.TEXTURE_MAG_FILTER, filter],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);
    return texture;
  }

  // Uploads a decoded photo once; returns null until it can be drawn.
  photo(image) {
    if (this.photos.has(image)) return this.photos.get(image);
    if (!image.complete || !image.naturalWidth) return null;
    const entry = { texture: this.texture(image, this.gl.LINEAR), width: image.naturalWidth, height: image.naturalHeight,
      inks: inkPalette(image) };
    this.photos.set(image, entry);
    return entry;
  }

  // Prints a photo's riso at a card's resting size, reprinting only when
  // that size or the screen's density changes.
  print(image, photo, width, height) {
    const gl = this.gl, dpr = this.dpr;
    const w = Math.round(width * RISO.overscan * dpr), h = Math.round(height * dpr);
    const key = `${w}x${h}`;
    let print = this.prints.get(image);
    if (print?.key === key) return print.texture;
    if (!print) {
      print = { texture: this.texture(null, gl.LINEAR), buffer: gl.createFramebuffer() };
      this.prints.set(image, print);
    }
    print.key = key;
    gl.bindTexture(gl.TEXTURE_2D, print.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, print.buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, print.texture, 0);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    this.use(this.printer);
    const u = this.printer.uniforms;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, photo.texture);
    gl.uniform2f(u.box, w, h);
    gl.uniform2f(u.imageSize, photo.width, photo.height);
    gl.uniform1f(u.grain, Math.max(RISO.grain * dpr, 1));
    gl.uniform3fv(u.inks, new Float32Array(photo.inks.flat()));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return print.texture;
  }

  // Each card: { image, rect (its window, CSS px), base {width, height} at
  // rest, parallax {x, y}, colour, appear }.
  draw(cards) {
    this.lastCards = cards;
    const gl = this.gl, dpr = this.dpr;
    const ready = cards.filter(card => card.appear > 0 && card.rect.x + card.rect.width > 0 && card.rect.x < innerWidth)
      .map(card => {
        const photo = this.photo(card.image);
        return photo && { ...card, photo, print: this.print(card.image, photo, card.base.width, card.base.height) };
      }).filter(Boolean);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    this.use(this.shower);
    const u = this.shower.uniforms;
    gl.uniform2f(u.screen, this.canvas.width, this.canvas.height);
    for (const card of ready) {
      const { rect } = card;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, card.photo.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, card.print);
      gl.uniform4f(u.rect, rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr);
      gl.uniform2f(u.imageSize, card.photo.width, card.photo.height);
      gl.uniform2f(u.parallax, card.parallax.x * dpr, card.parallax.y * dpr);
      gl.uniform1f(u.colour, card.colour);
      gl.uniform1f(u.appear, card.appear);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.activeTexture(gl.TEXTURE0);
  }
  capture(rect) {
    if (!this.lastCards) return null;
    try {
      // Redraw immediately before copying: WebGL's default buffer is transient.
      this.draw(this.lastCards);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
      canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
      canvas.getContext('2d').drawImage(this.canvas,
        rect.left * this.dpr, rect.top * this.dpr, rect.width * this.dpr, rect.height * this.dpr,
        0, 0, canvas.width, canvas.height);
      return canvas.toDataURL();
    } catch { return null; }
  }
}
