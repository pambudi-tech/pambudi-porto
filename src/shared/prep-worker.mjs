import { drawSprite, spriteKey, SPRITE } from '../stitch/render.mjs';
import { paperLayers } from '../paper/paper-material.mjs';
import { buildWaxSurface } from '../wax/wax-material.mjs';
import { ditherBitmap } from '../works/dither.mjs';

// The preparation worker (prep.mjs): the same pure drawing and pixel work the
// page would otherwise do itself, done here while the welcome plays.
const jobs = {
  sprites({ requests }) {
    const sprites = requests.map(([color, variation, step]) => {
      const canvas = new OffscreenCanvas(SPRITE.size, SPRITE.size);
      drawSprite(canvas.getContext('2d'), color, variation, step);
      return [spriteKey(color, variation, step), canvas.transferToImageBitmap()];
    });
    return [sprites, sprites.map(([, bitmap]) => bitmap)];
  },
  paper({ rgba, blurred, width, height }) {
    const layers = paperLayers(rgba, blurred, width, height);
    return [layers, [layers.grain.buffer, ...layers.responses.map(pixels => pixels.buffer)]];
  },
  async dither(payload) {
    return [await ditherBitmap(payload), []];
  },
  wax({ rgba, width, height }) {
    const surface = buildWaxSurface(rgba, width, height);
    return [surface, [surface.alpha.buffer, surface.normals.buffer, surface.rim.buffer, surface.pigment.buffer]];
  },
};

self.addEventListener('message', async ({ data: { id, type, payload } }) => {
  try {
    const [result, transfer] = await jobs[type](payload);
    self.postMessage({ id, result }, transfer);
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
});
