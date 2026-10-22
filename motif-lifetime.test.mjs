import test from 'node:test';
import assert from 'node:assert/strict';
import { StitchModel } from './model.mjs';
import { stampMotif } from './motifs.mjs';
import { MotifLifetimes, MOTIF_LIFETIME } from './motif-lifetime.mjs';

function scene(entries = [['-1000,0', '#353630']]) {
  const model = new StitchModel(entries), animations = new Map();
  const lifetime = new MotifLifetimes(model, animations);
  const place = (id, started, options = {}) => stampMotif(model, id, {
    started, ...options,
    onStamp: (transaction, cells, time) => lifetime.add(transaction, cells, time),
  });
  return { model, animations, lifetime, place };
}

test('a motif remains for 30 seconds then unpicks and leaves the original ornaments', () => {
  const { model, animations, lifetime, place } = scene();
  const initial = new Map(model.stitches);
  place('duck', 1000);
  const placed = new Map(model.stitches);
  assert.equal(lifetime.nextExpiry, 1000 + MOTIF_LIFETIME);
  assert.equal(lifetime.update(30_999), false);
  assert.deepEqual(model.stitches, placed);
  assert.equal(lifetime.update(31_000), true);
  assert.deepEqual(model.stitches, initial);
  assert.equal(model.undoStack.length, 0);
  assert.ok(animations.size > 0);
  assert.ok([...animations.values()].every(animation => animation.kind === 'unpick' && animation.from === 1 && animation.started >= 31_000));
  assert.equal(lifetime.nextExpiry, Infinity);
});

test('an older expiry preserves an overlapping newer motif, including identical thread cells', () => {
  for (const later of ['duck', 'watermelon']) {
    const { model, lifetime, place } = scene();
    const initial = new Map(model.stitches);
    place('duck', 0);
    place(later, 10_000);
    const expected = new StitchModel(initial);
    stampMotif(expected, later);
    lifetime.update(30_000, true);
    assert.deepEqual(model.stitches, expected.stitches, later);
    assert.equal(model.undoStack.length, 1);
    model.undo(); assert.deepEqual(model.stitches, initial);
    model.redo(); assert.deepEqual(model.stitches, expected.stitches);
    lifetime.update(40_000, true);
    assert.deepEqual(model.stitches, initial);
    assert.equal(model.undoStack.length, 0);
  }
});

test('undoing before the deadline cannot leave an expired motif in redo', () => {
  const { model, lifetime, place } = scene();
  const initial = new Map(model.stitches);
  place('rose', 0);
  model.undo(); lifetime.syncHistory();
  lifetime.update(30_000);
  assert.deepEqual(model.stitches, initial);
  assert.equal(model.redoStack.length, 0);
  assert.equal(model.redo(), false);
});

test('expiry keeps later manual stitches and rebases their undo to the bare surface', () => {
  const { model, lifetime, place } = scene();
  place('duck', 0);
  model.begin(); model.put(0, 0, '#4433ff'); model.commit();
  lifetime.syncHistory();
  lifetime.update(30_000, true);
  assert.equal(model.stitches.get('0,0'), '#4433ff');
  model.undo();
  assert.equal(model.stitches.has('0,0'), false);
  assert.equal(model.stitches.get('-1000,0'), '#353630');
});

test('reduced motion expires immediately and an underlying manual stitch is restored', () => {
  const { model, animations, lifetime, place } = scene([['0,0', '#113355']]);
  place('duck', 0);
  lifetime.update(30_000, true);
  assert.deepEqual([...model.stitches], [['0,0', '#113355']]);
  assert.equal(animations.size, 0);
});

test('expiry rebases a free stroke that is still being drawn', () => {
  const { model, lifetime, place } = scene();
  place('duck', 0);
  model.begin(); model.put(0, 0, '#4433ff');
  lifetime.update(30_000, true);
  assert.equal(model.stitches.get('0,0'), '#4433ff');
  model.commit(); model.undo();
  assert.equal(model.stitches.has('0,0'), false);
});
