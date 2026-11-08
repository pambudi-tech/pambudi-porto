import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS, canvasPlan, linkBox, linkLabel, opensTab } from './resume-layout.mjs';

const A4 = [0, 0, 595.92, 842.88];

test('a page canvas is crisp, pinchable on phones, and capped', () => {
  const phone = canvasPlan(343, A4, 3);
  assert.equal(phone.width, CANVAS.min);
  assert.ok(Math.abs(phone.scale - 343 / 595.92) < 1e-9);
  assert.ok(Math.abs(phone.height / phone.width - 842.88 / 595.92) < .002);
  assert.equal(canvasPlan(820, A4, 2).width, 1640);
  assert.equal(canvasPlan(820, A4, 4).width, CANVAS.max);
});

test('a link box is placed in percentages of its page, from the top', () => {
  const box = linkBox([100, 742.88, 200, 762.88], A4);
  assert.equal(box.left, `${(100 / 595.92 * 100).toFixed(3)}%`);
  assert.equal(box.top, `${(80 / 842.88 * 100).toFixed(3)}%`);
  assert.equal(box.width, `${(100 / 595.92 * 100).toFixed(3)}%`);
  assert.equal(box.height, `${(20 / 842.88 * 100).toFixed(3)}%`);
  assert.deepEqual(linkBox([200, 762.88, 100, 742.88], A4), box);
});

test('links are named aloud and web links open a tab', () => {
  assert.equal(linkLabel('https://wa.me/6287840009811'), 'WhatsApp +6287840009811');
  assert.equal(linkLabel('mailto:ivan@pambudi.xyz'), 'Email ivan@pambudi.xyz');
  assert.equal(linkLabel('https://pambudi.xyz/'), 'pambudi.xyz');
  assert.equal(linkLabel('https://www.linkedin.com/in/pambudixix'), 'linkedin.com/in/pambudixix');
  assert.equal(opensTab('https://wa.me/6287840009811'), true);
  assert.equal(opensTab('mailto:ivan@pambudi.xyz'), false);
});
