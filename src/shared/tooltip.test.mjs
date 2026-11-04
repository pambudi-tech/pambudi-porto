import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLTIP, tooltipTiming } from './tooltip.mjs';

test('the first tooltip waits; a neighbour of a shown one comes at once', () => {
  const timing = tooltipTiming();
  assert.equal(timing.enter(0), false);
  timing.leave(TOOLTIP.delay + 200);
  // Across the gap to the next icon.
  assert.equal(timing.enter(TOOLTIP.delay + 240), true);
});

test('passing over a control without its tooltip showing changes nothing', () => {
  const timing = tooltipTiming();
  timing.enter(0);
  timing.leave(TOOLTIP.delay - 100);
  assert.equal(timing.enter(TOOLTIP.delay - 60), false);
});

test('after a pause the next tooltip waits again', () => {
  const timing = tooltipTiming();
  timing.enter(0);
  timing.leave(1000);
  assert.equal(timing.enter(1000 + TOOLTIP.skip + 1), false);
});
