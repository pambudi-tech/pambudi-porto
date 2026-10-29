import test from 'node:test';
import assert from 'node:assert/strict';
import { StitchUnpick, UNPICK_STITCH, BRAND_UNPICK_SWEEP } from './stitch-unpick.mjs';
import { MotifLifetimes } from './motif-lifetime.mjs';
import { StitchModel } from './model.mjs';
import { stampMotif } from './motifs.mjs';

test('branding retracts in reverse sewing order and leaves unrelated cells visible', () => {
  const departure = new StitchUnpick([['first', 'middle', 'last']], { started: 100 });
  assert.equal(departure.progress('last', 100), 1);
  assert.equal(departure.progress('last', 100 + UNPICK_STITCH / 2), .5);
  assert.equal(departure.progress('first', 100 + UNPICK_STITCH / 2), 1);
  assert.equal(departure.progress('visitor-motif', 5000), 1);
  assert.equal(departure.progress('first', 100 + BRAND_UNPICK_SWEEP + UNPICK_STITCH), 0);
  assert.equal(departure.active(100 + BRAND_UNPICK_SWEEP + UNPICK_STITCH), false);
});

test('all corner groups retract together and reduced motion removes immediately', () => {
  const departure = new StitchUnpick([['a', 'b'], ['c', 'd']]);
  assert.equal(departure.progress('b', 140), departure.progress('d', 140));
  const reduced = new StitchUnpick([['a', 'b']], { reduced: true });
  assert.equal(reduced.progress('a', 0), 0);
  assert.equal(reduced.active(0), false);
});

test('returning from detail reverses the same thread timeline without replaying the welcome entrance', () => {
  const departure = new StitchUnpick([['first', 'last']], { started: 100 });
  const total = BRAND_UNPICK_SWEEP + UNPICK_STITCH;
  const outgoing = [0, 140, 400, 760, total].map(elapsed => ({
    elapsed, first: departure.progress('first', 100 + total - elapsed), last: departure.progress('last', 100 + total - elapsed),
  }));
  departure.reverse(5000);
  for (const sample of outgoing) {
    assert.ok(Math.abs(departure.progress('first', 5000 + sample.elapsed) - sample.first) < 1e-10);
    assert.ok(Math.abs(departure.progress('last', 5000 + sample.elapsed) - sample.last) < 1e-10);
  }
});

test('branding and motif expiry use the same stitch retraction duration', () => {
  const model = new StitchModel(), animations = new Map();
  const lifetimes = new MotifLifetimes(model, animations);
  stampMotif(model, 'duck', { started: 0, onStamp: (transaction, cells, time) => lifetimes.add(transaction, cells, time) });
  lifetimes.update(30_000);
  assert.ok(animations.size > 0);
  assert.ok([...animations.values()].every(animation => animation.duration === UNPICK_STITCH));
});
