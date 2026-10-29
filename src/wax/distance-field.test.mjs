import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceTo } from './distance-field.mjs';

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

