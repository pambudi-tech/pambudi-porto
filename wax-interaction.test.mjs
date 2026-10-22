import test from 'node:test';
import assert from 'node:assert/strict';
import { waxLightTarget, advanceWaxLight } from './wax-interaction.mjs';

const bounds = { left: 100, top: 100, width: 200, height: 70 };
test('wax light builds before the oval edge with no jump at hover entry', () => {
  const targetAt = x => waxLightTarget(bounds, x, 135).strength;
  assert.equal(targetAt(0), 0);
  assert.ok(targetAt(25) > 0);
  assert.ok(targetAt(25) < targetAt(50));
  assert.ok(targetAt(50) < targetAt(75));
  assert.ok(targetAt(99) > .99);
  assert.equal(targetAt(100), 1);
  assert.equal(targetAt(101), 1);
  assert.equal(waxLightTarget(bounds, 200, 135).strength, 1);
  assert.deepEqual(waxLightTarget({ ...bounds, width: 0 }, 200, 135), { x: 0, y: -.35, strength: 0 });
});

test('wax reflection and direction ease toward and away from a stationary pointer', () => {
  const rest = { x: 0, y: -.35, strength: 0 };
  const near = waxLightTarget(bounds, 75, 135);
  let current = advanceWaxLight(rest, near, 16);
  assert.ok(current.strength > 0 && current.strength < near.strength * .1);
  assert.ok(current.x < rest.x && current.x > near.x);
  for (let i = 0; i < 180; i++) current = advanceWaxLight(current, near, 16);
  assert.deepEqual(current, near);
  const leaving = advanceWaxLight(current, rest, 16);
  assert.ok(leaving.strength > 0 && leaving.strength < current.strength);
  for (let i = 0; i < 180; i++) current = advanceWaxLight(current, rest, 16);
  assert.deepEqual(current, rest);
});
