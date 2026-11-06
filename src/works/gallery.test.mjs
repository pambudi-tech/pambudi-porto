import test from 'node:test';
import assert from 'node:assert/strict';
import { ownShapeWidth } from './gallery.mjs';

test('a card that keeps its photo\'s shape: the window takes its aspect at the shared height, in whole perforations', () => {
  // A 4:3 piece matches a works card: a 300 px window inside a 12 px margin.
  assert.equal(ownShapeWidth(4 / 3, 249, 12, 6), 324);
  // A 4:5 poster is narrower, a 5:4 one a little less wide.
  assert.equal(ownShapeWidth(4 / 5, 249, 12, 6), 204);
  assert.equal(ownShapeWidth(5 / 4, 249, 12, 6), 306);
  for (const aspect of [.8, 1, 4 / 3, 1.31]) assert.equal(ownShapeWidth(aspect, 249, 12, 6) % 6, 0);
});
