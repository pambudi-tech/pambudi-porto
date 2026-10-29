import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTIFS, MotifBag, createMotif, stampMotif } from './motifs.mjs';
import { StitchModel } from './model.mjs';
import { SurfaceRenderer } from './render.mjs';

test('the nine supplied charts keep their source footprints, occupied cells, and assigned thread palettes', () => {
  const expected = [
    ['rose', 17, 26, 183], ['dinosaur', 18, 17, 194], ['sword', 15, 15, 79],
    ['dragon', 17, 21, 164], ['watermelon', 18, 17, 192], ['lightning', 11, 15, 92],
    ['bow', 16, 12, 140], ['duck', 15, 15, 144], ['diamond', 15, 11, 97],
  ];
  assert.deepEqual(MOTIFS.map(({ id, columns, lines }) => [id, columns, lines, createMotif(id).length]), expected);
  for (const motif of MOTIFS) {
    assert.ok(motif.rows.every(row => row.length === motif.columns));
    const cells = createMotif(motif.id, { col: 14, row: -8 });
    assert.equal(new Set(cells.map(cell => `${cell.col},${cell.row}`)).size, cells.length);
    assert.ok(cells.every(cell => Number.isInteger(cell.col) && Number.isInteger(cell.row)));
    assert.ok(cells.every(cell => motif.palette.includes(cell.color)));
    const shifted = createMotif(motif.id, { col: 20, row: 5, seed: 123 });
    const normalized = values => values.map(({ col, row, color }) => `${col},${row},${color}`).sort();
    assert.deepEqual(normalized(shifted.map(cell => ({ ...cell, col: cell.col - 6, row: cell.row - 13 }))), normalized(cells));
  }
});

test('the green dinosaur keeps its brown eye and the dragon keeps its open eye cell', () => {
  assert.equal(createMotif('dinosaur').filter(cell => cell.color === '#3b2913').length, 2);
  const dragon = new Map(createMotif('dragon').map(cell => [`${cell.col},${cell.row}`, cell.color]));
  assert.equal(dragon.has('1,-6'), false);
  assert.ok(createMotif('watermelon').some(cell => cell.color === '#f6f3e7'));
  assert.ok(createMotif('lightning').some(cell => cell.color === '#fff7dc'));
});

test('every placed motif matches its upright source chart cell for cell across reveal seeds', () => {
  for (const motif of MOTIFS) {
    const expected = new Map();
    motif.rows.forEach((line, y) => [...line].forEach((symbol, x) => {
      if (symbol !== '.') expected.set(`${12 + x - Math.floor(motif.columns / 2)},${-7 + y - Math.floor(motif.lines / 2)}`, motif.palette[parseInt(symbol, 36)]);
    }));
    for (const seed of [0, 123, 9999]) {
      const model = new StitchModel();
      stampMotif(model, motif.id, { col: 12, row: -7, seed });
      assert.deepEqual(model.stitches, expected, `${motif.id}, seed ${seed}`);
    }
  }
});

test('random selection serves every reference per round and avoids adjacent repeats', () => {
  const bag = new MotifBag(() => .42);
  const picks = Array.from({ length: 90 }, () => bag.next().id);
  for (let i = 0; i < picks.length; i += 9) assert.equal(new Set(picks.slice(i, i + 9)).size, 9);
  assert.ok(picks.every((id, i) => !i || id !== picks[i - 1]));
});

test('one click is one reversible motif, including overlapping reference colors', () => {
  const model = new StitchModel([['-1000,0', '#353630']]);
  const initial = [...model.stitches];
  const first = stampMotif(model, 'dinosaur', { started: 100 });
  const afterFirst = new Map(model.stitches);
  assert.equal(model.undoStack.length, 1);
  assert.equal(first.size, 194);
  assert.ok([...first.values()].every(animation => animation.kind === 'motif' && animation.started >= 100));
  stampMotif(model, 'watermelon', { col: 2 });
  const afterSecond = new Map(model.stitches);
  model.undo(); assert.deepEqual(model.stitches, afterFirst);
  model.undo(); assert.deepEqual([...model.stitches], initial);
  model.redo(); model.redo(); assert.deepEqual(model.stitches, afterSecond);
});

test('reduced motion shows a complete motif immediately and keeps protected ornament cells', () => {
  const model = new StitchModel([['0,0', '#353630']]);
  const animations = stampMotif(model, 'watermelon', { reduced: true, canPlace: (col, row) => col !== 0 || row !== 0 });
  assert.equal(animations.size, 0);
  assert.equal(model.stitches.get('0,0'), '#353630');
  assert.equal(model.undoStack.length, 1);
  assert.equal(model.stitches.size, 192);
});

test('motif stitching stays on the embroidery layer throughout its reveal', () => {
  const calls = [];
  const renderer = Object.create(SurfaceRenderer.prototype);
  Object.assign(renderer, { width: 400, height: 400, clear() {}, world() {},
    stitch: { drawImage: sprite => calls.push(sprite) },
    sprite: (color, variation, progress) => ({ color, progress }),
  });
  const model = { stitches: new Map([['0,0', '#80a33c']]) };
  const animations = new Map([['0,0', { kind: 'motif', started: 100, duration: 280 }]]);
  renderer.drawStitches(model, { x: 0, y: 0, scale: 1 }, animations, new Map(), null, 0);
  assert.equal(calls.length, 0);
  renderer.drawStitches(model, { x: 0, y: 0, scale: 1 }, animations, new Map(), null, 240);
  assert.deepEqual(calls, [{ color: '#80a33c', progress: .5 }]);
  renderer.gesture = {};
  renderer.drawInteraction({}, animations, null, '', 'motif', 240, false);
});
