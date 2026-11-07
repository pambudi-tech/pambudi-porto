import test from 'node:test';
import assert from 'node:assert/strict';
import { StitchModel } from './model.mjs';
import { stampMotif, MOTIFS } from './motifs.mjs';
import { seededRandom } from '../bird/flight-path.mjs';
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

// The lifetimes as they ran before: the history synced and every record
// checked on every frame.
function everyFrame(lifetime) {
  lifetime.historyMoved = () => true;
  Object.defineProperty(lifetime, 'soonest', { get: () => -Infinity, set() {} });
  return lifetime;
}

test('syncing only when the history moves keeps every frame exactly as syncing every frame did', () => {
  const ids = MOTIFS.map(motif => motif.id);
  for (let run = 0; run < 40; run++) {
    const random = seededRandom(run + 1);
    const sides = [scene(), scene()];
    everyFrame(sides[1].lifetime);
    const state = ({ model, animations, lifetime }) => JSON.stringify([
      [...model.stitches], model.undoStack.map(t => t.changes), model.redoStack.map(t => t.changes),
      [...animations], [...lifetime.journal.values()], [...lifetime.records.values()].map(record => record.deadline),
    ]);
    let time = 0;
    for (let step = 0; step < 160; step++) {
      const action = random(), at = Math.floor(random() * 20), reduced = random() < .2, color = ['#113355', '#4433ff', undefined][Math.floor(random() * 3)];
      const id = ids[Math.floor(random() * ids.length)], strokes = Math.floor(random() * 4) + 1;
      time += Math.floor(random() * (random() < .1 ? 20_000 : 600));
      const results = sides.map(({ model, animations, lifetime, place }) => {
        if (action < .18) place(id, time, { col: at, row: at % 7, seed: step, reduced });
        else if (action < .36) {
          model.begin();
          for (let i = 0; i < strokes; i++) model.put(at + i, at % 5, color);
          if (action < .33) model.commit();
        } else if (action < .46) model.undo();
        else if (action < .54) model.redo();
        else if (action < .56) {
          model.undoStack = [];
          model.redoStack = [];
          lifetime.records.clear();
          lifetime.journal.clear();
          animations.clear();
        } else if (action < .58) lifetime.syncHistory();
        return lifetime.update(time, reduced);
      });
      assert.equal(results[0], results[1], `run ${run} step ${step}`);
      assert.equal(state(sides[0]), state(sides[1]), `run ${run} step ${step}`);
    }
  }
});
