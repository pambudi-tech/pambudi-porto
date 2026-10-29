import test from 'node:test';
import assert from 'node:assert/strict';
import { projectHref, PROJECT_FLIGHT } from './project-transition.mjs';
import { BRAND_UNPICK_SWEEP, UNPICK_STITCH } from './stitch-unpick.mjs';

test('each sample project keeps its identity on direct load and refresh', () => {
  assert.equal(projectHref({ href: './ocean.html', id: 'natuno' }, 'https://portfolio.test/#works'), 'https://portfolio.test/ocean.html?work=natuno');
  assert.equal(projectHref({ href: './custom.html', id: 'custom' }, 'https://portfolio.test/#works'), 'https://portfolio.test/custom.html');
});

test('the image flight finishes after the final branding stitch retracts', () => {
  assert.ok(PROJECT_FLIGHT.duration >= BRAND_UNPICK_SWEEP + UNPICK_STITCH);
});
