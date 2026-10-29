import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectStitches } from './project-stitches.mjs';
import { THREAD_COLORS } from '../stitch/thread-colors.mjs';
import { ENTRANCE } from '../stitch/stitch-entrance.mjs';

test('project stitches wait for reveal, grow thread in place, and stay sewn through layout changes', () => {
  const originalRAF = globalThis.requestAnimationFrame, originalMedia = globalThis.matchMedia;
  const frames = [], draws = [];
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  globalThis.matchMedia = () => ({ matches: false });
  const canvas = { dataset: {}, width: 100, height: 100, isConnected: true, getContext: () => ({
    setTransform() {}, clearRect() {}, drawImage: (...args) => draws.push(args),
  }) };
  try {
    const stitches = new ProjectStitches(canvas);
    for (let step = 0; step <= 12; step++) stitches.sprites.set(`${THREAD_COLORS.red}:0:${step}`, { step });
    const cells = [{ key: 'a', variation: 0, x: 22, y: 44 }];
    stitches.layout(cells, [['a']], 1, 1);
    assert.equal(draws.length, 0);
    assert.equal(canvas.dataset.entrance, 'pending');
    stitches.reveal();
    frames.shift()(stitches.entrance.started + ENTRANCE.delay + ENTRANCE.stitch / 2);
    assert.equal(draws.at(-1)[0].step, 6);
    const halfwayPosition = draws.at(-1).slice(1);
    stitches.paint(stitches.entrance.started + ENTRANCE.delay + stitches.entrance.sweep + ENTRANCE.stitch);
    assert.equal(canvas.dataset.entrance, 'complete');
    assert.deepEqual(draws.at(-1).slice(1), halfwayPosition);
    stitches.entrance.started = -10_000;
    stitches.layout(cells, [['a']], 2, 1);
    assert.equal(stitches.started, true);
    assert.equal(canvas.dataset.entrance, 'complete');
  } finally {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.matchMedia = originalMedia;
  }
});

test('reduced motion shows the complete project ornament without scheduling animation', () => {
  const originalMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const canvas = { dataset: {}, width: 100, height: 100, isConnected: true,
      getContext: () => ({ setTransform() {}, clearRect() {}, drawImage() {} }) };
    const stitches = new ProjectStitches(canvas);
    stitches.sprites.set(`${THREAD_COLORS.red}:0:12`, {});
    stitches.layout([{ key: 'a', variation: 0, x: 0, y: 0 }], [['a']], 1, 1);
    stitches.reveal();
    assert.equal(canvas.dataset.entrance, 'complete');
    assert.equal(canvas.dataset.visibleStitches, '1');
  } finally { globalThis.matchMedia = originalMedia; }
});
