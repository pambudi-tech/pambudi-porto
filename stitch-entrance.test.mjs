import test from 'node:test';
import assert from 'node:assert/strict';
import { StitchEntrance, ENTRANCE, wordmarkEntranceOrder } from './stitch-entrance.mjs';
import { cornerPattern, cornerEntranceGroups } from './corners.mjs';
import { SurfaceRenderer } from './render.mjs';

test('entrance starts bare, sews progressively, and ends with complete stitches', () => {
  const entrance = new StitchEntrance({ started: 1000, sweep: 1000 });
  entrance.plan([['first', 'middle', 'last'], ['other-corner-first', 'other-corner-last']]);
  assert.equal(entrance.progress('first', 1000), 0);
  assert.equal(entrance.progress('first', 1000 + ENTRANCE.delay + ENTRANCE.stitch / 2), .5);
  assert.equal(entrance.progress('last', 1500), 0);
  assert.equal(entrance.progress('first', 1500), entrance.progress('other-corner-first', 1500));
  const end = 1000 + ENTRANCE.delay + 1000 + ENTRANCE.stitch;
  assert.equal(entrance.active(end), false);
  for (const key of ['first', 'middle', 'last']) assert.equal(entrance.progress(key, end), 1);
  assert.equal(entrance.progress('visitor-stitch', 1000), 1);
});

test('reduced motion and direct interaction complete stitches without replaying', () => {
  const reduced = new StitchEntrance({ reduced: true });
  reduced.plan([['a', 'b']]);
  assert.equal(reduced.active(0), false);
  assert.equal(reduced.progress('a', 0), 1);
  const entrance = new StitchEntrance();
  entrance.plan([['a', 'b']]);
  entrance.complete('a');
  assert.equal(entrance.progress('a', 0), 1);
  entrance.finish();
  entrance.plan([['new-cell-after-resize']]);
  assert.equal(entrance.progress('new-cell-after-resize', 0), 1);
  assert.equal(entrance.active(0), false);
});

test('corner groups retain every source stitch and progress away from their outer corner', () => {
  const entries = cornerPattern().entries;
  const groups = cornerEntranceGroups(entries);
  assert.deepEqual(groups.map(group => group.length), [171, 171, 171, 171]);
  assert.deepEqual(new Set(groups.flat()), new Set(entries.map(([key]) => key)));
  const distances = groups[0].map(key => { const [x, y] = key.split(',').map(Number); return x + 1000 + y; });
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
});

test('wordmark stitches follow a continuous bottom-to-top serpentine order', () => {
  assert.deepEqual(wordmarkEntranceOrder([[2, 3], [1, 0], [2, 1], [1, 2], [3, 2], [4, 3]]), ['4,3', '2,3', '1,2', '3,2', '2,1', '1,0']);
});

test('entrance changes thread length on the embroidery layer without changing saved cells', () => {
  const calls = [];
  const renderer = Object.create(SurfaceRenderer.prototype);
  Object.assign(renderer, {
    stitch: { drawImage: sprite => calls.push(sprite) },
    width: 800, height: 800,
    clear() {}, world() {},
    sprite(color, variation, progress = 1) { return { color, progress }; },
  });
  const model = { stitches: new Map([['0,0', '#353630']]), undoStack: [] };
  const original = [...model.stitches];
  const entrance = new StitchEntrance({ sweep: 0 });
  entrance.plan([['0,0']]);
  const view = { x: 100, y: 100, scale: 1 };
  renderer.drawStitches(model, view, new Map(), new Map(), entrance, 0);
  assert.equal(calls.length, 0);
  renderer.drawStitches(model, view, new Map(), new Map(), entrance, ENTRANCE.delay + ENTRANCE.stitch / 2);
  assert.deepEqual(calls, [{ color: '#353630', progress: .5 }]);
  assert.deepEqual([...model.stitches], original);
  assert.deepEqual(model.undoStack, []);
});
