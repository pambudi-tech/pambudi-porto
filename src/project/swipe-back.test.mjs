import test from 'node:test';
import assert from 'node:assert/strict';
import { SWIPE_BACK, swipeIntent } from './swipe-back.mjs';

const width = 375, from = { x: 100, y: 400 };
const at = (dx, dy) => ({ x: from.x + dx, y: from.y + dy });

test('a long, level swipe to the right is a back', () => {
  assert.equal(swipeIntent(from, at(SWIPE_BACK.distance, 10), width), 'back');
  assert.equal(swipeIntent(from, at(SWIPE_BACK.distance - 10, 0), width), null, 'not far enough yet');
  assert.equal(swipeIntent(from, at(5, 2), width), null, 'too short to tell');
});

test('scrolls, left swipes and the browser edge are not', () => {
  assert.equal(swipeIntent(from, at(30, 60), width), 'other', 'mostly down: a scroll');
  assert.equal(swipeIntent(from, at(-80, 0), width), 'other', 'to the left');
  assert.equal(swipeIntent({ x: 10, y: 400 }, { x: 200, y: 400 }, width), 'other', 'from the left edge');
  assert.equal(swipeIntent({ x: width - 10, y: 400 }, { x: width + 100, y: 400 }, width), 'other', 'from the right edge');
});
