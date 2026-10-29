import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceRenderer } from './render.mjs';

function recordedAnimation(kind, time) {
  const calls = [];
  const context = new Proxy({}, {
    set(target, key, value) { calls.push([key, value]); target[key] = value; return true; },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push([key, ...args]);
    },
  });
  const renderer = Object.create(SurfaceRenderer.prototype);
  renderer.gesture = context;
  renderer.clear = () => {};
  renderer.world = () => {};
  renderer.drawInteraction({}, new Map([['0,0', { kind, color: 'garnet', started: 0, duration: 400 }]]), null, 'garnet', 'stitch', time, false);
  return calls;
}

test('unpick renders the exact reverse geometry of stitch creation, with no fading or lift', () => {
  for (const time of [0, 100, 200, 300, 400]) {
    const forward = recordedAnimation('add', time);
    const backward = recordedAnimation('erase', 400 - time);
    assert.deepEqual(backward, forward);
    assert.equal(backward.some(([operation]) => operation === 'globalAlpha'), false);
    assert.ok(backward.filter(([operation]) => operation === 'translate').every(([, x, y]) => x === 0 && y === 0));
  }
});

test('a queued unpick keeps the whole stitch visible until its reverse animation starts', () => {
  assert.deepEqual(recordedAnimation('erase', -50), recordedAnimation('add', 400));
});

test('the bird shares the stitch canvas while permanent embroidery and history retain their cells', () => {
  const calls = [];
  const renderer = Object.create(SurfaceRenderer.prototype);
  renderer.stitch = { drawImage: (sprite, ...bounds) => calls.push({ ...sprite, bounds }) };
  renderer.clear = () => {};
  renderer.world = () => {};
  renderer.sprite = (color, variation, progress = 1) => ({ color, progress });
  renderer.width = renderer.height = 800;
  renderer.resolveCell = (col, row) => col === -1000 ? [3, 5] : [col, row];
  const model = { stitches: new Map([['-1000,0', '#353630'], ['4,5', 'garnet']]), undoStack: [] };
  const original = [...model.stitches];
  const moving = new Map([
    ['3,5', { col: 3, row: 5, color: 'bird', progress: 1 }],
    ['4,5', { col: 4, row: 5, color: 'bird', progress: .5 }],
    ['6,5', { col: 6, row: 5, color: 'bird', progress: .5 }],
  ]);
  const view = { x: 0, y: 0, scale: 1 };
  renderer.drawStitches(model, view, new Map(), moving);
  assert.deepEqual(calls.map(call => call.color), ['#353630', 'garnet', 'bird']);
  assert.deepEqual(calls[2], { color: 'bird', progress: .5, bounds: [6 * 22 - 5, 5 * 22 - 5, 32, 32] });
  calls.length = 0;
  renderer.drawStitches(model, view);
  assert.deepEqual(calls.map(call => call.color), ['#353630', 'garnet']);
  assert.deepEqual([...model.stitches], original);
  assert.deepEqual(model.undoStack, []);
});

test('settled embroidery is drawn once to a layer, then only copied while the bird moves', () => {
  const layerCalls = [], screenCalls = [];
  const renderer = Object.create(SurfaceRenderer.prototype);
  renderer.stitch = { setTransform() {}, drawImage: image => screenCalls.push(image.color ?? 'layer') };
  renderer.stitchCanvas = { width: 1600, height: 1600 };
  renderer.layer = { getContext: () => ({ drawImage: image => layerCalls.push(image.color) }) };
  renderer.clear = () => {};
  renderer.world = () => {};
  renderer.sprite = (color, variation, progress = 1) => ({ color, progress });
  renderer.width = renderer.height = 800;
  const model = { stitches: new Map([['1,1', 'garnet'], ['2,1', 'pine']]) };
  const view = { x: 0, y: 0, scale: 1 };
  const bird = new Map([['2,1', { col: 2, row: 1, color: 'bird', progress: 1 }], ['5,5', { col: 5, row: 5, color: 'bird', progress: 1 }]]);
  for (let frame = 0; frame < 3; frame++) renderer.drawStitches(model, view, new Map(), bird, null, frame, { settled: true });
  assert.deepEqual(layerCalls, ['garnet', 'pine'], 'the layer is drawn once');
  assert.deepEqual(screenCalls, ['layer', 'bird', 'layer', 'bird', 'layer', 'bird'], 'the bird skips the stitched cell');
  // A change to the stitches redraws the layer on the next settled frame.
  model.stitches.set('1,1', 'pine');
  renderer.invalidate();
  layerCalls.length = 0;
  renderer.drawStitches(model, view, new Map(), new Map(), null, 3, { settled: true });
  assert.deepEqual(layerCalls, ['pine', 'pine']);
  // While anything animates, every stitch is drawn directly and the layer is
  // rebuilt once things settle again.
  layerCalls.length = screenCalls.length = 0;
  renderer.drawStitches(model, view, new Map(), new Map(), null, 4);
  assert.deepEqual(screenCalls, ['pine', 'pine']);
  renderer.drawStitches(model, view, new Map(), new Map(), null, 5, { settled: true });
  assert.deepEqual(layerCalls, ['pine', 'pine']);
});
