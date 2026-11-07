import test from 'node:test';
import assert from 'node:assert/strict';
import { passCookie } from './works-pass.mjs';
import handler from '../api/resume.js';

process.env.WORKS_PIN = '123456';
process.env.WORKS_SECRET = 'a-test-secret-of-some-length';

function call(cookie = '') {
  const headers = {};
  const response = { statusCode: 0, setHeader: (name, value) => { headers[name] = value; }, end: body => { response.body = body; } };
  return handler({ headers: { cookie, host: 'pambudi.xyz' } }, response).then(() => ({ ...response, headers }));
}

test('the resume is refused without a pass', async () => {
  const response = await call();
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['Content-Type'], 'application/json');
});

test('a pass downloads the resume PDF, never cached', async () => {
  const response = await call(passCookie({ headers: { host: 'pambudi.xyz' } }).split(';')[0]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'application/pdf');
  assert.match(response.headers['Content-Disposition'], /^attachment; filename="Ivan-Pambudi-Resume\.pdf"$/);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.body.subarray(0, 5).toString(), '%PDF-');
});
