import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWaxSurface, shadeWaxSurface } from './wax-material.mjs';

const width = 128, height = 48;
const rgba = new Uint8ClampedArray(width * height * 4);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  if (((x - 64) / 58) ** 2 + ((y - 24) / 21) ** 2 >= 1) continue;
  rgba.set([145, 12, 9, 255], (y * width + x) * 4);
}
const surface = buildWaxSurface(rgba, width, height);

test('wax relief stays on the source outline and produces unit normals', () => {
  let tilted = 0;
  for (let i = 0; i < width * height; i++) {
    const normal = surface.normals.subarray(i * 3, i * 3 + 3);
    if (!rgba[i * 4 + 3]) assert.deepEqual([...normal], [0, 0, 0]);
    else {
      assert.ok(Math.abs(Math.hypot(...normal) - 1) < .00001);
      if (Math.abs(normal[0]) + Math.abs(normal[1]) > .15) tilted++;
    }
  }
  assert.ok(tilted > 100, 'the rim and grooves must have sloped normals');
});

test('moving the light changes contour reflections without tinting transparent areas', () => {
  const left = shadeWaxSurface(surface, -.8, -.4);
  const right = shadeWaxSurface(surface, .8, -.4);
  let changed = 0, visible = 0;
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    if (!rgba[p + 3]) assert.equal(left[p + 3] + right[p + 3], 0);
    if (left[p + 3] !== right[p + 3]) changed++;
    if (left[p + 3] > 0) {
      visible++;
      assert.ok(left[p] > left[p + 1] * 4 && left[p] > left[p + 2] * 4, 'reflection keeps red pigment');
    }
  }
  assert.ok(changed > 100);
  assert.ok(visible > 100);
  assert.deepEqual(shadeWaxSurface(surface, 10, -10), shadeWaxSurface(surface, 1, -1));
});
