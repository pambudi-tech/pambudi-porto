import test from 'node:test';
import assert from 'node:assert/strict';
import { PASS, checkPin, hasPass, isProtected, passCookie, privateAsset } from './works-pass.mjs';

process.env.WORKS_PIN = '123456';
process.env.WORKS_SECRET = 'a-test-secret-of-some-length';
const request = (cookie = '', host = 'pambudi.xyz') => ({ headers: { cookie, host } });
const cookieOf = header => header.split(';')[0];

test('only the six-digit PIN is right', () => {
  assert.equal(checkPin('123456'), true);
  assert.equal(checkPin('123457'), false);
  assert.equal(checkPin(123456), false);
  assert.equal(checkPin(''), false);
});

test('a pass is a signed, day-long, secure cookie', () => {
  const header = passCookie(request());
  assert.match(header, new RegExp(`Max-Age=${PASS.seconds}`));
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.doesNotMatch(passCookie(request('', '127.0.0.1:4317')), /Secure/);
  assert.equal(hasPass(request(cookieOf(header))), true);
});

test('a forged, altered or expired pass is refused', () => {
  const [name, value] = cookieOf(passCookie(request())).split('=');
  const [expires, signature] = value.split('.');
  assert.equal(hasPass(request()), false);
  assert.equal(hasPass(request(`${name}=${Number(expires) + 60}.${signature}`)), false);
  assert.equal(hasPass(request(`${name}=${expires}.${signature.slice(1)}x`)), false);
  assert.equal(hasPass(request(`${name}=1.${signature}`)), false);
});

test('only protected work is protected, and private files stay inside', async () => {
  assert.equal(isProtected('bca-prioritas'), true);
  assert.equal(isProtected('ocean'), false);
  assert.equal(await privateAsset('../../content/site.mjs'), null);
  assert.equal(await privateAsset('ocean/01.webp'), null);
  const cover = await privateAsset('bca-prioritas/cover.webp');
  assert.equal(cover.type, 'image/webp');
  assert.ok(cover.body.length > 10000);
});
