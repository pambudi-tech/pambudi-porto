import test from 'node:test';
import assert from 'node:assert/strict';
import { bayer8, ditherColor } from './dither.mjs';

const luma = ([r, g, b]) => .299 * r + .587 * g + .114 * b;
const tile = (f) => Array.from({ length: 64 }, (_, i) => f(i % 8, Math.floor(i / 8)));

test('the Bayer pattern uses each of its 64 thresholds once per 8×8 tile, and repeats', () => {
  const thresholds = tile(bayer8).map(value => Math.round(value * 64)).sort((a, b) => a - b);
  assert.deepEqual(thresholds, Array.from({ length: 64 }, (_, i) => i));
  assert.equal(bayer8(3, 5), bayer8(11, 13));
});

test('a tile of dots averages to the photo’s own brightness', () => {
  for (const rgb of [[.1, .2, .3], [.8, .3, .2], [.5, .5, .5], [.95, .9, .7]]) {
    const average = tile((x, y) => luma(ditherColor(rgb, x, y))).reduce((sum, value) => sum + value, 0) / 64;
    assert.ok(Math.abs(average - luma(rgb)) < 1 / 64 + 1e-9, `${rgb}: ${average} vs ${luma(rgb)}`);
  }
});

test('dots keep the photo’s colour: no palette, only brightness steps', () => {
  const rgb = [.6, .3, .15];
  const dots = new Set(tile((x, y) => ditherColor(rgb, x, y).map(value => value.toFixed(4)).join()));
  assert.ok(dots.size >= 2 && dots.size <= 3, 'a flat colour steps between neighbouring levels');
  for (const dot of tile((x, y) => ditherColor(rgb, x, y))) {
    if (luma(dot) <= luma(rgb)) assert.ok(Math.abs(dot[0] / dot[1] - 2) < 1e-9, 'darker dots keep the hue');
    else assert.ok(dot[0] >= rgb[0] && dot[1] >= rgb[1] && dot[2] >= rgb[2], 'lighter dots move toward white');
  }
  assert.deepEqual(ditherColor([0, 0, 0], 2, 3), [0, 0, 0]);
  assert.deepEqual(ditherColor([1, 1, 1], 2, 3), [1, 1, 1]);
});
