import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT_FLIGHT } from './project-transition.mjs';
import { BRAND_UNPICK_SWEEP, UNPICK_STITCH } from '../stitch/stitch-unpick.mjs';

test('the image flight finishes after the final branding stitch retracts', () => {
  assert.ok(PROJECT_FLIGHT.duration >= BRAND_UNPICK_SWEEP + UNPICK_STITCH);
});
