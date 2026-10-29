import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchHold } from './touch-hold.mjs';

function setup() {
  const held = [], timers = new Map();
  let next = 0;
  const press = new TouchHold(start => held.push(start), {
    schedule: callback => { timers.set(++next, callback); return next; },
    cancel: id => timers.delete(id),
  });
  const flush = () => { for (const callback of [...timers.values()]) callback(); timers.clear(); };
  return { press, held, flush };
}

test('holding opens controls without also returning a tap to stitch', () => {
  const { press, held, flush } = setup();
  press.begin(7, 80, 120);
  assert.equal(press.move(7, 82, 121), null);
  flush();
  assert.deepEqual(held, [{ id: 7, x: 80, y: 120 }]);
  assert.equal(press.take(7), null);
});

test('a short tap supplies its position once and cancels the hold', () => {
  const { press, held, flush } = setup();
  press.begin(7, 80, 120);
  assert.deepEqual(press.take(7), { id: 7, x: 80, y: 120 });
  assert.equal(press.take(7), null);
  flush();
  assert.deepEqual(held, []);
});

test('dragging begins at the original touch point without opening controls', () => {
  const { press, held, flush } = setup();
  press.begin(7, 80, 120);
  assert.deepEqual(press.move(7, 100, 140), { id: 7, x: 80, y: 120 });
  flush();
  assert.deepEqual(held, []);
  assert.equal(press.take(7), null);
});

test('cancelled or replaced touches cannot become a hold or a stitch', () => {
  const { press, held, flush } = setup();
  press.begin(7, 80, 120);
  press.cancel();
  flush();
  assert.equal(press.take(7), null);
  press.begin(8, 20, 30);
  press.begin(9, 40, 50);
  assert.equal(press.take(8), null);
  flush();
  assert.deepEqual(held, [{ id: 9, x: 40, y: 50 }]);
});
