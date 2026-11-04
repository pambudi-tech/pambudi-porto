import test from 'node:test';
import assert from 'node:assert/strict';
import { SWITCH, rowDelay } from './project-switch.mjs';

test('every row of the project list has settled within its time', () => {
  for (const count of [1, 2, 6, 12, 40]) {
    const last = rowDelay(count - 1, count) + SWITCH.row;
    assert.ok(last <= SWITCH.within, `${count} rows end at ${last}ms`);
    assert.ok(last < 300);
  }
});

test('a short list keeps its rows a full stagger apart', () => {
  assert.equal(rowDelay(1, 3) - rowDelay(0, 3), SWITCH.stagger);
});
