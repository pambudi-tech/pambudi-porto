import test from 'node:test';
import assert from 'node:assert/strict';
import { WAX_POUR, pourAt } from './wax-pour.mjs';

test('it begins as nothing, wet, with no stamp', () => {
  const start = pourAt(0);
  assert.deepEqual([start.spread, start.form, start.wet, start.stamp, start.label, start.done], [0, 0, 1, 0, 0, false]);
});

test('the puddle spreads quickly, then slower, before the stamp shapes it', () => {
  const early = pourAt(200).spread, middle = pourAt(600).spread, late = pourAt(1000).spread;
  assert.ok(early > 0 && early / 200 > (middle - early) / 400 && (middle - early) / 400 > (late - middle) / 400);
  assert.equal(pourAt(1200).spread, 1);
  assert.equal(pourAt(1200).form, 0);
});

test('the stamp casts its shadow before it presses', () => {
  const before = pourAt(1350);
  assert.ok(before.stamp > .5 && before.form === 0);
});

test('pressing squeezes the wax to the outline and holds the middle deep', () => {
  const held = pourAt(2100);
  assert.equal(held.form, 1);
  assert.ok(held.press > 1.1);
  assert.equal(held.label, 0, 'the lettering shows only once the stamp lifts');
});

test('the stamp lifts, leaving the label, and the wax sets', () => {
  const lifted = pourAt(2700);
  assert.equal(lifted.stamp, 0);
  assert.equal(lifted.press, 1);
  assert.equal(lifted.label, 1);
  assert.ok(lifted.wet > 0, 'still wet just after the lift');
  const end = pourAt(WAX_POUR.duration);
  assert.deepEqual([end.spread, end.form, end.press, end.wet, end.stamp, end.label, end.done], [1, 1, 1, 0, 0, 1, true]);
});

test('the press has weight: it does not snap most of the way at contact', () => {
  assert.ok(pourAt(1500).form < .1, 'meets the wax gently');
  assert.ok(pourAt(1700).form > .4 && pourAt(1700).form < .6, 'squeezes through its middle');
  assert.ok(1 - pourAt(1900).form < .1, 'eases to a stop');
});

test('the stamp shadow gives way as it presses, so the held wax keeps its colour', () => {
  assert.ok(pourAt(2100).stamp < .35);
  assert.ok(pourAt(1400).stamp > pourAt(2100).stamp * 2);
});
