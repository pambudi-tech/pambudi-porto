import test from 'node:test';
import assert from 'node:assert/strict';
import { WAX_POUR, pourAt, glintLamp } from './wax-pour.mjs';

test('the pour starts empty, molten and unpressed', () => {
  const start = pourAt(0);
  assert.equal(start.pour, 0);
  assert.equal(start.molten, 1);
  assert.equal(start.press, 0);
  assert.equal(start.label, 0);
  assert.equal(start.done, false);
});

test('it runs in order: spread, cooled, pressed, glinted', () => {
  const spread = pourAt(560), cooled = pourAt(900), pressed = pourAt(1100);
  assert.equal(spread.pour, 1);
  assert.ok(spread.molten > 0 && spread.press === 0, 'still warm and unpressed once spread');
  assert.equal(cooled.molten, 0);
  assert.equal(pressed.press, 1);
  assert.equal(pressed.label, 1);
  assert.ok(pourAt(1200).glint > 0);
});

test('the stamp goes a little past and settles', () => {
  const deepest = Math.max(...Array.from({ length: 29 }, (_, i) => pourAt(820 + i * 10).press));
  assert.ok(deepest > 1.02 && deepest < 1.2);
});

test('it ends exactly at rest', () => {
  const end = pourAt(WAX_POUR.duration);
  assert.deepEqual([end.pour, end.molten, end.press, end.label, end.done], [1, 0, 1, 1, true]);
  assert.ok(Math.abs(end.glint) < 1e-12);
});

test('the glint lamp runs low across the top, left to right', () => {
  const [x0, y0, z0] = glintLamp(0, 2.75), [x1] = glintLamp(1, 2.75);
  assert.ok(x0 < 0 && x1 > 0 && y0 > 0 && z0 < 1);
});
