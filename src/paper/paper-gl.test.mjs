import test from 'node:test';
import assert from 'node:assert/strict';
import { reliefRect, lightPosition, PAPER_LIGHT, RELIEF_MARGIN } from './paper-gl.mjs';
import { FRAME_REGISTRATION } from './frame-registration.mjs';

test('the relief image frames the traced frame with the model card margin', () => {
  const r = FRAME_REGISTRATION, unit = r.width / 1028;
  const [x, y, width, height] = reliefRect();
  assert.ok(Math.abs(x * r.paperWidth - (r.x - RELIEF_MARGIN.x * unit)) < 1e-9);
  assert.ok(Math.abs(y * r.paperHeight - (r.y - RELIEF_MARGIN.y * unit)) < 1e-9);
  // The frame stays centred inside it, and it stays within the paper image.
  assert.ok(Math.abs((x + width / 2) * r.paperWidth - (r.x + r.width / 2)) < 1e-9);
  assert.ok(x > 0 && y > 0 && x + width < 1 && y + height < 1);
  // Close to the 2048 × 2560 relief master's proportions; the photograph's
  // ornament is drawn a little taller, and the measured fit follows it.
  assert.ok(Math.abs(width * r.paperWidth / (height * r.paperHeight) - .8) < .02);
  const [bx, by] = reliefRect([2, -8]);
  assert.ok(Math.abs((bx - x) * r.paperWidth - 2) < 1e-9 && Math.abs((by - y) * r.paperHeight + 8) < 1e-9);
});

test('the light rests above the upper left and follows the pointer on hover', () => {
  assert.deepEqual(lightPosition({}, .8), PAPER_LIGHT.rest);
  const [x, y, z] = lightPosition({ lx: 1, ly: -1, light: 1 }, .8);
  assert.ok(Math.abs(x - PAPER_LIGHT.reach * .8) < 1e-12);
  assert.ok(Math.abs(y + PAPER_LIGHT.reach) < 1e-12);
  assert.equal(z, PAPER_LIGHT.height);
  const half = lightPosition({ lx: 1, ly: -1, light: .5 }, .8);
  assert.ok(half[0] > PAPER_LIGHT.rest[0] && half[0] < x);
});
