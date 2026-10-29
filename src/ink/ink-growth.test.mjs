import test from 'node:test';
import assert from 'node:assert/strict';
import { growthField, revealInk } from './ink-growth.mjs';

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
