import test from 'node:test';
import assert from 'node:assert/strict';
import { PRELOADER, LoadingCounter, loadingProgress, minimumElapsed, settleWithin } from './loading-progress.mjs';

test('cached loading starts at zero and eases in and out over the two-second minimum', () => {
  const counter = new LoadingCounter(0);
  assert.equal(counter.update(100, 0), 0);
  const values = [0, 500, 1000, 1500, 2000].map(now => Math.floor(counter.sample(now)));
  assert.deepEqual(values, [0, 1, 50, 98, 100]);
  assert.ok(values[1] - values[0] < values[2] - values[1]);
  assert.ok(values[4] - values[3] < values[3] - values[2]);
});

test('eased loading waits for actual work and retargets continuously when a late asset finishes', () => {
  const counter = new LoadingCounter(0);
  assert.equal(counter.update(0, 4000), 0, 'elapsed time alone cannot create progress');
  counter.update(71, 4000);
  assert.equal(counter.update(71, 6000), 71);
  assert.equal(counter.update(100, 8000), 71, 'the new target cannot jump the display');
  const midway = counter.update(100, 8180);
  assert.ok(midway > 71 && midway < 100);
  assert.equal(counter.update(100, 8360), 97);
  assert.equal(counter.update(100, 8460), 98);
  assert.equal(counter.update(100, 8640), 99);
  assert.equal(counter.update(100, 8940), 100);
});

test('the final four percentages appear individually even after a long frame', () => {
  const counter = new LoadingCounter(0);
  counter.update(100, 0);
  assert.equal(counter.update(100, 1000), 50);
  assert.equal(counter.update(100, 2400), 97);
  assert.equal(counter.update(100, 2499), 97);
  assert.equal(counter.update(100, 2500), 98);
  assert.equal(counter.update(100, 2679), 98);
  assert.equal(counter.update(100, 2680), 99);
  assert.equal(counter.update(100, 2979), 99);
  assert.equal(counter.update(100, 2980), 100);
});

test('the actual resource target reaches 100% independently of the display timer', () => {
  assert.equal(loadingProgress(7, 7), 100);
  assert.equal(minimumElapsed(0), false);
  assert.equal(minimumElapsed(PRELOADER.minimum - 1), false);
  assert.equal(minimumElapsed(PRELOADER.minimum), true);
});

test('pending resources remain incomplete even after the minimum expires', () => {
  assert.equal(minimumElapsed(PRELOADER.minimum * 3), true);
  assert.equal(loadingProgress(6, 7), 85);
  assert.equal(loadingProgress(7, 7), 100);
  assert.equal(loadingProgress(0, 7), 0);
});

test('only completed loading work changes the bounded percentage', () => {
  assert.equal(loadingProgress(-1, 7), 0);
  assert.equal(loadingProgress(20, 7), 100);
  assert.deepEqual([0, 5, 5, 6, 7].map(completed => loadingProgress(completed, 7)), [0, 71, 71, 85, 100]);
});

test('resource deadlines preserve success and failure and release stalled requests', async () => {
  assert.equal(await settleWithin(Promise.resolve('decoded'), 100), 'decoded');
  await assert.rejects(settleWithin(Promise.reject(new Error('Image unavailable')), 100), /Image unavailable/);
  await assert.rejects(settleWithin(new Promise(() => {}), 5), /Resource loading timed out/);
});

test('only time with animation frames counts toward the resource deadline', async () => {
  // A scheduler that draws frames only while the page is shown.
  let shown = false, now = 0, queued = null;
  const requestFrame = callback => { queued = callback; return 1; };
  const advance = (ms, step = 16) => {
    for (let t = 0; t < ms; t += step) {
      now += step;
      if (shown && queued) { const callback = queued; queued = null; callback(now); }
    }
  };
  let finish;
  const loading = settleWithin(new Promise(resolve => { finish = resolve; }), 200, { requestFrame, cancelFrame() {} });
  advance(1000); // Not drawn: nothing counts, however long it lasts.
  shown = true;
  advance(100);
  finish('ready');
  assert.equal(await loading, 'ready');
  // Drawn frames do count, and a long pause between two counts as one short step.
  queued = null;
  const stalled = settleWithin(new Promise(() => {}), 200, { requestFrame, cancelFrame() {} });
  let settled = false;
  stalled.catch(() => {}).finally(() => { settled = true; });
  advance(16);
  advance(5000, 5000);
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(settled, false, 'a five-second gap counts as 100ms');
  advance(300);
  await assert.rejects(stalled, /Resource loading timed out/);
});
