import test from 'node:test';
import assert from 'node:assert/strict';
import { StitchWordmark } from './wordmark.mjs';
import { StitchEntrance } from './stitch-entrance.mjs';

// A canvas context that records what is drawn on it, by sprite name.
function recorder(canvas) {
  const calls = [];
  return {
    canvas, calls,
    setTransform() {},
    clearRect: (...box) => calls.push(['clear', ...box]),
    drawImage: (image, ...box) => calls.push([image.name ?? 'spare', ...box.slice(-4)]),
  };
}

// A wordmark of `columns` × `rows` stitches on a 1:1 canvas, its entrance done.
function wordmark(columns, rows) {
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext() { return (this.context ??= recorder(this)); } }) };
  const canvas = { width: columns * 22 + 10, height: rows * 22 + 10, dataset: {} };
  const mark = Object.create(StitchWordmark.prototype);
  Object.assign(mark, {
    canvas, context: recorder(canvas), view: { x: 5, y: 5, scale: 1 }, dpr: 1, isDots: false,
    entrance: new StitchEntrance({ reduced: true }),
    sprite: (color, variation, progress) => ({ name: `${variation}:${Math.round(progress * 12)}` }),
  });
  mark.cells = Array.from({ length: columns * rows }, (_, i) => [i % columns, Math.floor(i / columns)]);
  mark.cellKeys = mark.cells.map(([col, row]) => `${col},${row}`);
  mark.variations = mark.cells.map(() => 0);
  mark.planTiles();
  // The sprites drawn are kept, as the cache keeps them.
  const sprites = new Map();
  mark.sprite = (color, variation, progress) => {
    const name = `${variation}:${Math.round(progress * 12)}`;
    if (!sprites.has(name)) sprites.set(name, { name });
    return sprites.get(name);
  };
  return mark;
}

test('the wordmark is painted whole first, then only where its stitches change', () => {
  const mark = wordmark(30, 4);
  mark.paint(0);
  assert.deepEqual(mark.context.calls[0], ['clear', 0, 0, mark.canvas.width, mark.canvas.height]);
  assert.equal(mark.context.calls.filter(([name]) => name === '0:12').length, 120, 'every stitch, once');
  mark.context.calls.length = 0;
  mark.paint(1);
  assert.deepEqual(mark.context.calls, [], 'nothing changed, nothing drawn');
  // The dove covers one hole: its tiles are sewn again on the spare canvas,
  // every stitch reaching into them in order, and copied across.
  mark.cover(new Set(['10,1']));
  const spare = mark.spare.calls, copied = mark.context.calls;
  const cleared = spare.filter(([name]) => name === 'clear'), drawn = spare.filter(([name]) => name !== 'clear');
  assert.ok(cleared.length > 0 && cleared.length < 6);
  assert.deepEqual(copied.map(([name]) => name), cleared.flatMap(() => ['clear', 'spare']));
  assert.deepEqual(copied.filter(([name]) => name === 'clear').map(call => call.slice(1)), cleared.map(call => call.slice(1)), 'the same tiles');
  assert.deepEqual(copied.filter(([name]) => name === 'spare').map(call => call.slice(1)), cleared.map(call => call.slice(1)), 'copied pixel for pixel');
  assert.ok(drawn.length < 30, 'only the stitches near the hole');
  // Those around the hole are all drawn; the covered one is left out.
  const indexes = drawn.map(([, x, y]) => (y + 5) / 22 * 30 + (x + 5) / 22);
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b), 'in their usual order');
  for (const [col, row] of [[9, 0], [10, 0], [11, 0], [9, 1], [11, 1], [9, 2], [10, 2], [11, 2]]) {
    assert.ok(indexes.includes(row * 30 + col), `${col},${row} is drawn again`);
  }
  assert.ok(!indexes.includes(1 * 30 + 10));
});

test('a change across most of the wordmark paints it whole, and a resize starts over', () => {
  const mark = wordmark(12, 3);
  mark.paint(0);
  mark.context.calls.length = 0;
  mark.cover(new Set(mark.cellKeys.slice(0, 30)));
  assert.equal(mark.context.calls[0][0], 'clear');
  assert.deepEqual(mark.context.calls[0].slice(1), [0, 0, mark.canvas.width, mark.canvas.height]);
  assert.equal(mark.spare.calls.length, 0);
  mark.context.calls.length = 0;
  mark.shown = null;
  mark.paint(1);
  assert.equal(mark.context.calls.filter(([name]) => name === '0:12').length, 6, 'the six not covered');
});

test('the scene may hand over the same covered Set each frame, refilled', () => {
  const mark = wordmark(30, 4);
  mark.paint(0);
  const covered = new Set(['10,1']);
  const painted = () => {
    mark.context.calls.length = 0;
    mark.cover(covered);
    return mark.context.calls.length > 0;
  };
  assert.equal(painted(), true);
  assert.equal(painted(), false, 'the same holes: nothing to sew');
  covered.clear();
  covered.add('11,1');
  assert.equal(painted(), true, 'refilled with another hole');
  assert.ok(!mark.covered.has('10,1') && mark.covered.has('11,1'));
  assert.notEqual(mark.covered, covered, 'kept as a copy');
  covered.clear();
  assert.equal(painted(), true, 'emptied');
  assert.equal(painted(), false);
});
