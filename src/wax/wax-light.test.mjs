import test from 'node:test';
import assert from 'node:assert/strict';
import { WAX_INK, WAX_REST, lampInSeal, fieldLight, inkColour, labelFill } from './wax-light.mjs';

test('a pointer position becomes a lamp in the seal space, y turned up', () => {
  assert.deepEqual(lampInSeal({ x: 1, y: 1 }, 3, .8), [1.5, -.5, .8]);
  assert.deepEqual(lampInSeal({ x: -1, y: -1 }, 3, .8), [-1.5, .5, .8]);
  const rest = lampInSeal(WAX_REST, 2.75, 1);
  assert.ok(rest[0] < 0 && rest[1] > 0, 'rests above the upper left');
});

test('the field is brightest right under the lamp and dims away from it', () => {
  const under = fieldLight(0, 100, 60), near = fieldLight(60, 100, 60), far = fieldLight(400, 100, 60);
  assert.ok(under.diffuse > near.diffuse && near.diffuse > far.diffuse);
  assert.ok(under.shine > near.shine && near.shine > far.shine);
});

test('at rest the ink keeps its own red; it brightens nearer the lamp and darkens away', () => {
  const resting = fieldLight(120, 100, 60);
  assert.deepEqual(inkColour(120, 100, resting, 60), [...WAX_INK]);
  const nearer = inkColour(20, 100, resting, 60), farther = inkColour(500, 100, resting, 60);
  assert.ok(nearer.every((value, i) => value >= WAX_INK[i]) && nearer[0] > WAX_INK[0]);
  assert.ok(farther.every((value, i) => value <= WAX_INK[i]) && farther[0] < WAX_INK[0]);
});

test('the fill is centred under the lamp, in the label box', () => {
  const fill = labelFill([.5, -.25, 1], [-.75, .45, 1], { unit: 100, centre: [80, 20], gloss: 60 });
  assert.match(fill, /^radial-gradient\(circle at 130\.0px 45\.0px, rgb\(/);
  assert.equal(fill.match(/rgb\(/g).length, 8);
});
