import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceTo, reliefHeight, renderPaper } from './paper-relief-kernel.mjs';

test('Euclidean distances agree with brute force, including diagonal paths', () => {
  const width = 9, height = 7;
  const mask = new Uint8Array(width * height);
  const seeds = [[2, 2], [6, 5], [7, 1]];
  for (const [x, y] of seeds) mask[y * width + x] = 255;
  const distances = distanceTo(mask, width, height, true);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const expected = Math.min(...seeds.map(([a, b]) => Math.hypot(x - a, y - b)));
    assert.ok(Math.abs(distances[y * width + x] - expected) < 1e-5);
  }
});

test('only the frame rises; flat gaps and center remain at zero relief', () => {
  assert.equal(reliefHeight(-10, 1.25, 8), 0);
  assert.equal(reliefHeight(0, 1.25, 8), 0);
  assert.ok(reliefHeight(4, 1.25, 8) > 0);
  assert.equal(reliefHeight(20, 1.25, 8), 1.25);
});

test('raised frame catches upper-left light and preserves solid interior paper', () => {
  const width = 41, height = 41;
  const ornament = new Uint8Array(width * height);
  const paper = new Uint8Array(width * height);
  for (let y = 3; y < 38; y++) for (let x = 3; x < 38; x++) {
    paper[y * width + x] = 255;
    if (x >= 15 && x <= 25) ornament[y * width + x] = 255;
  }
  const pixels = renderPaper({ width, height, ornament, paper, settings: { depth: 1.25, bevel: 4, paperHeight: .55, paperBevel: 2.5, grain: 0, tone: 245 } });
  const p = (x, y, channel = 0) => pixels[(y * width + x) * 4 + channel];
  assert.ok(p(17, 20) > p(23, 20), 'left slope is illuminated; right slope is shaded');
  assert.equal(p(5, 20, 3), 255, 'negative space remains opaque paper');
  assert.equal(p(20, 20, 3), 255, 'raised ornament remains opaque');
  assert.equal(p(0, 20, 3), 0, 'outside paper stays transparent');
});
