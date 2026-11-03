import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapWords } from './wax-letters.mjs';

const measure = text => text.length * 10;

test('words share a line while they fit, as the browser wraps them', () => {
  assert.deepEqual(wrapWords(['works'], 200, measure), ['works']);
  assert.deepEqual(wrapWords(['view', 'selected', 'works'], 200, measure), ['view selected works']);
  assert.deepEqual(wrapWords(['let’s', 'build', 'something', 'together'], 160, measure), ['let’s build', 'something', 'together']);
});

test('a word wider than the line still gets a line of its own', () => {
  assert.deepEqual(wrapWords(['a', 'extraordinarily', 'b'], 60, measure), ['a', 'extraordinarily', 'b']);
});
