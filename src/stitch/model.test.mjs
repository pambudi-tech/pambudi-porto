import test from 'node:test';
import assert from 'node:assert/strict';
import { StitchModel, cellsBetween } from './model.mjs';

test('a fast drag has no missing squares in any direction', () => {
  for (const end of [[30, 4], [-4, 30], [-30, -4], [4, -30], [0, 0]]) {
    const cells = cellsBetween([0, 0], end);
    assert.deepEqual(cells[0], [0, 0]);
    assert.deepEqual(cells.at(-1), end);
    assert.equal(cells.length, Math.max(Math.abs(end[0]), Math.abs(end[1])) + 1);
    cells.slice(1).forEach((cell, i) => {
      assert.ok(Math.abs(cell[0] - cells[i][0]) <= 1);
      assert.ok(Math.abs(cell[1] - cells[i][1]) <= 1);
    });
  }
});

test('a drag is one undo, including overwritten and repeatedly visited stitches', () => {
  const model = new StitchModel([['1,1', 'pine']]);
  model.begin();
  model.put(0, 0, 'garnet');
  model.put(1, 1, 'garnet');
  model.put(1, 1, 'rose');
  model.commit();
  assert.equal(model.undoStack.length, 1);
  model.undo();
  assert.deepEqual([...model.stitches], [['1,1', 'pine']]);
  model.redo();
  assert.equal(model.stitches.get('1,1'), 'rose');
  assert.equal(model.stitches.get('0,0'), 'garnet');
});

test('unpick and clearing can both be undone without losing the original threads', () => {
  const original = [['0,0', 'garnet'], ['1,2', 'pine'], ['-2,1', '#c40000']];
  const model = new StitchModel(original);
  model.replace([]);
  assert.equal(model.stitches.size, 0);
  model.undo();
  assert.deepEqual([...model.stitches], original);
  model.put(...original[0][0].split(',').map(Number), undefined);
  model.commit();
  assert.equal(model.stitches.size, original.length - 1);
  model.undo();
  assert.equal(model.stitches.get(original[0][0]), original[0][1]);
});

test('a new gesture invalidates redo, while a no-op does not', () => {
  const model = new StitchModel();
  model.put(0, 0, 'garnet'); model.commit(); model.undo();
  model.put(5, 5, undefined); model.commit();
  assert.equal(model.redoStack.length, 1);
  model.put(1, 1, 'pine'); model.commit();
  assert.equal(model.redoStack.length, 0);
});

test('undo and redo restore pattern density and size together with the stitches', () => {
  const before = { columns: 64, rows: 80, size: 94 };
  const after = { columns: 128, rows: 160, size: 94 };
  const model = new StitchModel([['1,1', 'garnet']], before);
  model.replace([['2,2', 'pine']], after);
  assert.deepEqual(model.layout, after);
  model.undo();
  assert.deepEqual(model.layout, before);
  assert.deepEqual([...model.stitches], [['1,1', 'garnet']]);
  model.redo();
  assert.deepEqual(model.layout, after);
  assert.deepEqual([...model.stitches], [['2,2', 'pine']]);
});

test('a density-only import remains undoable even with no changed stitches', () => {
  const model = new StitchModel();
  const original = model.layout;
  model.replace([], { columns: 80, rows: 80, size: 60 });
  assert.equal(model.undoStack.length, 1);
  model.undo();
  assert.deepEqual(model.layout, original);
});
