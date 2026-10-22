import test from 'node:test';
import assert from 'node:assert/strict';
import { inkProximity, advanceInk, INK_HOVER } from './intro-ink-hover.mjs';

const bounds = { left: 100, top: 100, right: 300, bottom: 200, width: 200, height: 100 };

test('ink begins outside the paragraph and joins continuously at its edge', () => {
  assert.equal(inkProximity(bounds, 100 - INK_HOVER.reach, 150), 0);
  assert.equal(inkProximity(bounds, 55, 150), .5);
  assert.ok(inkProximity(bounds, 99, 150) > .999);
  assert.equal(inkProximity(bounds, 100, 150), 1);
  assert.equal(inkProximity(bounds, 200, 150), 1);
  assert.ok(inkProximity(bounds, 80, 80) < inkProximity(bounds, 80, 100));
  assert.equal(inkProximity({ ...bounds, width: 0 }, 200, 150), 0);
});

test('ink eases in and out without jumping or overshooting and eventually rests', () => {
  const target = { x: 120, y: 60, strength: 1 };
  let current = advanceInk({ x: 0, y: 0, strength: 0 }, target, 16);
  assert.ok(current.strength > 0 && current.strength < .2);
  assert.ok(current.x > 0 && current.x < target.x);
  for (let frame = 0; frame < 200; frame++) current = advanceInk(current, target, 16);
  assert.deepEqual(current, target);
  const leaving = { ...target, strength: 0 };
  current = advanceInk(current, leaving, 16);
  assert.ok(current.strength > .8 && current.strength < 1);
  for (let frame = 0; frame < 200; frame++) current = advanceInk(current, leaving, 16);
  assert.deepEqual(current, leaving);
});
