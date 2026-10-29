import { clamp } from '../shared/math.mjs';
// A matte enhancement over the approved image, not a replacement for it.
// The image's luminance provides a subtle relief proxy; it is not a height map.
function noise(x, y) {
  let n = Math.imul(x + 71, 374761393) ^ Math.imul(y + 19, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295 - .5;
}
function layer(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

export class PaperMaterial {
  constructor(image) {
    this.image = image;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'paper-material';
    this.canvas.setAttribute('aria-hidden', 'true');
  }
  prepare() {
    const width = Math.min(896, this.image.naturalWidth);
    const height = Math.round(width * this.image.naturalHeight / this.image.naturalWidth);
    this.canvas.width = width; this.canvas.height = height;
    this.context = this.canvas.getContext('2d');
    this.mask = layer(width, height);
    const source = this.mask.getContext('2d', { willReadFrequently: true });
    source.drawImage(this.image, 0, 0, width, height);
    const rgba = source.getImageData(0, 0, width, height).data;
    const smooth = layer(width, height).getContext('2d', { willReadFrequently: true });
    smooth.filter = 'blur(1.4px)';
    smooth.drawImage(this.mask, 0, 0);
    const blurred = smooth.getImageData(0, 0, width, height).data;
    this.grain = layer(width, height);
    const grainContext = this.grain.getContext('2d');
    const grain = grainContext.createImageData(width, height);
    this.relief = Array.from({ length: 4 }, () => layer(width, height));
    const responses = this.relief.map(canvas => canvas.getContext('2d').createImageData(width, height));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Fine mottling plus longer fibers. Both are deterministic and fixed to the sheet.
      const fiber = noise(x, y) * 7 + noise(Math.floor((x + y * .12) / 2), Math.floor(y / 7)) * 4;
      for (let channel = 0; channel < 3; channel++) grain.data[i + channel] = rgba[i + channel] + fiber;
      grain.data[i + 3] = rgba[i + 3];
      let dx = 0, dy = 0;
      // Avoid treating the transparent silhouette as an embossed ridge.
      if (x > 2 && x < width - 3 && y > 2 && y < height - 3
        && [i, i - 8, i + 8, i - width * 8, i + width * 8].every(p => rgba[p + 3] > 250)) {
        dx = (blurred[i + 8] - blurred[i - 8]) / 4;
        dy = (blurred[i + width * 8] - blurred[i - width * 8]) / 4;
      }
      [dx, -dx, dy, -dy].forEach((slope, index) => {
        const pixels = responses[index].data;
        // Encode a bounded luminance change directly. Soft-light blending on
        // near-white paper attenuates this detail until it is almost invisible.
        const delta = clamp(slope * 3.5, -14, 14);
        const bright = delta >= 0;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = bright ? 255 : 0;
        pixels[i + 3] = clamp(Math.abs(delta) / Math.max(4, bright ? 255 - rgba[i] : rgba[i]), 0, .65) * 255;
      });
    }
    grainContext.putImageData(grain, 0, 0);
    this.relief.forEach((canvas, i) => canvas.getContext('2d').putImageData(responses[i], 0, 0));
    this.draw({});
    this.image.after(this.canvas);
    this.canvas.dataset.materialReady = 'true';
  }
  draw({ lx = 0, ly = 0, light = 0 }) {
    // Compositing precomputed textures avoids per-pixel work during pointer movement.
    const key = [lx, ly, light].map(n => n.toFixed(3)).join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    const context = this.context, { width, height } = this.canvas;
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    context.drawImage(this.grain, 0, 0);
    context.globalAlpha = Math.abs(lx) * .72;
    context.drawImage(this.relief[lx >= 0 ? 0 : 1], 0, 0);
    context.globalAlpha = Math.abs(ly) * .72;
    context.drawImage(this.relief[ly >= 0 ? 2 : 3], 0, 0);
    // Broad diffuse illumination, with no specular streak or moving noise.
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = light * .78;
    const lightX = width * (.5 + lx * .55), lightY = height * (.5 + ly * .55);
    const diffuse = context.createRadialGradient(lightX, lightY, 0, lightX, lightY, height * .85);
    diffuse.addColorStop(0, 'rgb(255 255 255 / .24)');
    diffuse.addColorStop(.35, 'rgb(255 255 255 / 0)');
    diffuse.addColorStop(1, 'rgb(75 70 60 / .19)');
    context.fillStyle = diffuse;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'destination-in';
    context.globalAlpha = 1;
    context.drawImage(this.mask, 0, 0);
    context.globalCompositeOperation = 'source-over';
  }
}
