import test from 'node:test';
import assert from 'node:assert/strict';
import { growthField, revealInk, inkDensity } from './ink-growth.mjs';

const sample = () => {
  const width = 18, height = 12;
  const rgba = new Uint8ClampedArray(width * height * 4);
  // Two distinct letter silhouettes, including antialiased edge pixels.
  for (const start of [1, 10]) for (let y = 1; y < 11; y++) for (let x = start; x < start + 5; x++) {
    if (x > start && y > 2 && y < 8) continue;
    const offset = (y * width + x) * 4;
    rgba.set([73, 72, 63, x === start + 4 ? 96 : 255], offset);
  }
  const glyphs = [1, 10].map(left => ({ left, right: left + 5, top: 1, bottom: 11 }));
  let seed = 9;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  return { rgba, width, height, glyphs, random };
};

test('both letters grow independently from deposits before the passage is complete', () => {
  const { rgba, width, height, glyphs, random } = sample();
  const field = growthField(rgba, width, height, glyphs, random);
  const target = new Uint8ClampedArray(rgba);
  revealInk(target, field, .2);
  for (const glyph of glyphs) {
    const visible = [], pending = [];
    for (let y = glyph.top; y < glyph.bottom; y++) for (let x = glyph.left; x < glyph.right; x++) {
      const offset = (y * width + x) * 4 + 3;
      if (!rgba[offset]) continue;
      visible.push(target[offset] > 0);
      pending.push(target[offset] < rgba[offset]);
    }
    assert.ok(visible.some(Boolean), 'each letter has started');
    assert.ok(pending.some(Boolean), 'each letter still has room to grow');
  }
});

test('ink only grows inside letter strokes and preserves the final antialiasing', () => {
  const { rgba, width, height, glyphs, random } = sample();
  const field = growthField(rgba, width, height, glyphs, random);
  const target = new Uint8ClampedArray(rgba);
  let previous = new Uint8ClampedArray(rgba.length);
  for (const progress of [0, .1, .3, .6, 1]) {
    revealInk(target, field, progress);
    for (let offset = 3; offset < rgba.length; offset += 4) {
      assert.ok(target[offset] >= previous[offset], 'ink coverage does not withdraw');
      assert.ok(target[offset] <= rgba[offset], 'ink stays inside the source glyph');
    }
    previous = new Uint8ClampedArray(target);
  }
  assert.deepEqual(target, rgba);
});

// The field and mask as first written, an object a pixel and a sine a pixel:
// the faster ones must give exactly the same numbers from the same draws.
function referenceField(rgba, width, height, glyphs, random) {
  const arrival = new Float32Array(width * height).fill(1);
  const covered = new Uint8Array(width * height);
  for (const glyph of glyphs) {
    const points = [];
    for (let y = Math.max(0, glyph.top); y < Math.min(height, glyph.bottom); y++) {
      for (let x = Math.max(0, glyph.left); x < Math.min(width, glyph.right); x++) {
        const index = y * width + x;
        if (rgba[index * 4 + 3]) points.push({ x, y, index });
      }
    }
    if (!points.length) continue;
    const seeds = Array.from({ length: Math.min(3, Math.max(1, Math.ceil(points.length / 90))) }, () => points[Math.floor(random() * points.length)]);
    const distances = points.map(point => Math.min(...seeds.map(seed => Math.hypot(point.x - seed.x, point.y - seed.y))));
    const maximum = Math.max(1, ...distances);
    points.forEach((point, i) => {
      const value = .035 + distances[i] / maximum * .79 + random() * .065;
      arrival[point.index] = Math.min(arrival[point.index], value);
      covered[point.index] = 1;
    });
  }
  const pixels = [];
  for (let index = 0; index < arrival.length; index++) {
    if (!rgba[index * 4 + 3]) continue;
    if (!covered[index]) arrival[index] = .15 + random() * .65;
    pixels.push(index);
  }
  return { pixels: Uint32Array.from(pixels), arrival, source: rgba };
}

function referenceDensity(rgba, width, height, glyphs, dpr, random) {
  const field = referenceField(rgba, width, height, glyphs, random);
  const padding = Math.ceil(8 * dpr);
  const densityWidth = width + padding * 2, densityHeight = height + padding * 2;
  const pixels = new Uint8ClampedArray(densityWidth * densityHeight * 4);
  for (let y = 0; y < densityHeight; y++) for (let x = 0; x < densityWidth; x++) {
    const col = x - padding, row = y - padding;
    const index = row * width + col;
    const inside = col >= 0 && row >= 0 && col < width && row < height;
    const fallback = .25 + .2 * (1 + Math.sin(x / (9 * dpr)) * Math.sin(y / (7 * dpr)));
    const arrival = inside && field.arrival[index] < 1 ? field.arrival[index] : fallback;
    const offset = (y * densityWidth + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
    pixels[offset + 3] = Math.round((1 - arrival) * 255);
  }
  return { pixels, width: densityWidth, height: densityHeight };
}

const drawsFrom = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// Lettering of blobs with soft edges, and boxes that overlap, run off the
// edges, or hold nothing.
function lettering(seed, width, height) {
  const random = drawsFrom(seed);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const glyphs = [];
  for (let n = 0; n < 9; n++) {
    const cx = random() * width, cy = random() * height, r = 2 + random() * 9;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r + 1) rgba[(y * width + x) * 4 + 3] = Math.max(rgba[(y * width + x) * 4 + 3], d < r ? 255 : 90);
    }
    glyphs.push({ left: Math.floor(cx - r - 3), right: Math.ceil(cx + r + 3), top: Math.floor(cy - r - 2), bottom: Math.ceil(cy + r + 4) });
  }
  glyphs.push({ left: width - 4, right: width + 6, top: -3, bottom: 5 }, { left: 0, right: 0, top: 0, bottom: 9 });
  return { rgba, glyphs };
}

test('the growth field is exactly the one first written, draw for draw', () => {
  for (const [seed, width, height] of [[3, 60, 24], [17, 97, 41], [2026, 33, 70]]) {
    const { rgba, glyphs } = lettering(seed, width, height);
    const ours = growthField(rgba, width, height, glyphs, drawsFrom(seed * 7));
    const reference = referenceField(rgba, width, height, glyphs, drawsFrom(seed * 7));
    assert.deepEqual(ours.arrival, reference.arrival);
    assert.deepEqual(ours.pixels, reference.pixels);
    assert.equal(ours.source, rgba);
  }
});

test('the density mask is exactly the one first written, at every density', () => {
  for (const dpr of [1, 1.5, 2]) {
    const { rgba, glyphs } = lettering(11, 70, 30);
    const ours = inkDensity(rgba, 70, 30, glyphs, dpr, drawsFrom(5));
    const reference = referenceDensity(rgba, 70, 30, glyphs, dpr, drawsFrom(5));
    assert.equal(ours.width, reference.width);
    assert.equal(ours.height, reference.height);
    assert.deepEqual(ours.pixels, reference.pixels);
  }
});
