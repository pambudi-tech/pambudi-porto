import test from 'node:test';
import assert from 'node:assert/strict';
import { StitchModel } from './model.mjs';
import { FreeStitch, FREE_THREAD, FREE_THREADS } from './free-stitch.mjs';

test('fast freehand strokes fill skipped cells and undo or redo as one action', () => {
  const model = new StitchModel([['2,0', '#c40000']]);
  const animations = new Map();
  const stroke = new FreeStitch(model, animations);
  stroke.begin([0, 0], 0);
  stroke.move([8, 0], 20);
  stroke.move([0, 0], 40);
  stroke.finish();
  assert.equal(model.stitches.size, 9);
  assert.equal(model.undoStack.length, 1);
  assert.equal(animations.get('2,0').started, 20);
  model.undo();
  assert.deepEqual([...model.stitches], [['2,0', '#c40000']]);
  model.redo();
  assert.equal(model.stitches.get('8,0'), FREE_THREAD);
});

test('protected cells stay clear and pausing across paper does not bridge the gap', () => {
  const model = new StitchModel([['2,0', 'pine']]);
  const stroke = new FreeStitch(model, new Map(), { canPlace: col => col !== 2 });
  stroke.begin([0, 0], 0);
  stroke.move([3, 0], 10);
  stroke.pause();
  stroke.move([10, 0], 20);
  stroke.finish();
  assert.equal(model.stitches.get('2,0'), 'pine');
  assert.equal(model.stitches.has('4,0'), false);
  assert.equal(model.stitches.get('10,0'), FREE_THREAD);
});

test('a reduced-motion tap is one finished stitch and a repeated tap adds no history', () => {
  const model = new StitchModel();
  const animations = new Map();
  const stroke = new FreeStitch(model, animations);
  for (let i = 0; i < 2; i++) {
    stroke.begin([-2, 5], 0, true);
    stroke.finish();
  }
  assert.deepEqual([...model.stitches], [['-2,5', FREE_THREAD]]);
  assert.equal(model.undoStack.length, 1);
  assert.equal(animations.size, 0);
});

test('all six thread colors draw and color replacement stays undoable', () => {
  assert.deepEqual(FREE_THREADS.map(thread => thread.name), ['Blue', 'Yellow', 'Red', 'Green', 'Purple', 'Black']);
  const model = new StitchModel([['0,0', 'pine']]);
  const stroke = new FreeStitch(model, new Map());
  for (const { color } of FREE_THREADS) {
    stroke.color = color;
    stroke.begin([0, 0], 0, true);
    stroke.finish();
    assert.equal(model.stitches.get('0,0'), color);
  }
  for (let i = 0; i < 6; i++) model.undo();
  assert.equal(model.stitches.get('0,0'), 'pine');
});

test('unstitch reverses the current reveal without a jump and restores exact colors on undo', () => {
  const model = new StitchModel([['0,0', '#356ac3'], ['1,0', '#c6434b']]);
  const animations = new Map([['0,0', { kind: 'motif', started: 0, duration: 340 }]]);
  const stroke = new FreeStitch(model, animations);
  stroke.tool = 'unpick';
  stroke.begin([0, 0], 170);
  stroke.move([2, 0], 170);
  stroke.finish();
  assert.equal(model.stitches.size, 0);
  assert.equal(animations.get('0,0').from, .5);
  assert.equal(animations.get('0,0').duration, 170);
  assert.equal(animations.get('1,0').color, '#c6434b');
  assert.equal(animations.has('2,0'), false);
  model.undo();
  assert.deepEqual([...model.stitches], [['0,0', '#356ac3'], ['1,0', '#c6434b']]);
});

test('reduced-motion unstitch resolves anchored ornament cells and removes immediately', () => {
  const model = new StitchModel([['-1000,0', 'pine']]);
  const animations = new Map();
  const stroke = new FreeStitch(model, animations, { resolveCell: () => [-1000, 0] });
  stroke.tool = 'unpick';
  stroke.begin([5, 3], 0, true);
  stroke.finish();
  assert.equal(model.stitches.size, 0);
  assert.equal(animations.size, 0);
  model.undo();
  assert.equal(model.stitches.get('-1000,0'), 'pine');
});
