import test from 'node:test';
import assert from 'node:assert/strict';
import { WAX_ENTRANCE, WaxEntrance, waxFlowAt, waxSpreadAt } from './wax-entrance.mjs';

test('wax begins as a round center pool and spreads into the full elongated footprint', () => {
  const width = 768, height = 280;
  const start = waxSpreadAt(0, width, height);
  const xs = start.points.map(p => p[0]), ys = start.points.map(p => p[1]);
  assert.equal(start.opacity, 0);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - (Math.max(...ys) - Math.min(...ys))) < .001);
  let previousWidth = 0, previousHeight = 0;
  for (let i = 0; i <= 100; i++) {
    const state = waxSpreadAt(i / 100, width, height);
    const x = state.points.map(p => p[0]), y = state.points.map(p => p[1]);
    const spreadWidth = Math.max(...x) - Math.min(...x), spreadHeight = Math.max(...y) - Math.min(...y);
    assert.ok(spreadWidth >= previousWidth && spreadHeight >= previousHeight, 'the wax front must advance, not pulse backward');
    assert.ok(state.points.every(p => p.every(Number.isFinite)));
    previousWidth = spreadWidth; previousHeight = spreadHeight;
  }
  const end = waxSpreadAt(1, width, height);
  assert.equal(end.edge, 0);
  assert.ok(previousWidth > width && previousHeight > height, 'the final reveal must cover the original image');
});

test('the soft wax front stays bounded and fades away as the image is revealed', () => {
  assert.ok(waxSpreadAt(.3, 768, 280).edge > .9);
  assert.ok(waxSpreadAt(WAX_ENTRANCE.labelAt, 768, 280).edge > 0, 'the outer wax should still flow when the label starts');
  assert.equal(WAX_ENTRANCE.labelAt, .5);
  assert.deepEqual(waxSpreadAt(-1, 768, 280), waxSpreadAt(0, 768, 280));
  assert.deepEqual(waxSpreadAt(2, 768, 280), waxSpreadAt(1, 768, 280));
});

test('the moving front stays softly uneven while every ray continues outward', () => {
  const width = 768, height = 280;
  const radii = waxSpreadAt(.2, width, height).points.map(([x, y]) =>
    Math.hypot((x - width / 2) / (width * .57), (y - height / 2) / (height * .63)));
  const unevenness = Math.max(...radii) / Math.min(...radii);
  assert.ok(unevenness > 1.2 && unevenness < 2.3, 'the spreading edge should stay organic without thin pointed fingers');
  let previous = waxSpreadAt(0, width, height).points;
  for (let i = 1; i <= 100; i++) {
    const current = waxSpreadAt(i / 100, width, height).points;
    current.forEach(([x, y], j) => assert.ok(
      Math.hypot(x - width / 2, y - height / 2) >= Math.hypot(previous[j][0] - width / 2, previous[j][1] - height / 2) - 1e-10));
    previous = current;
  }
});

test('the original soft label reveal starts halfway through and settles before the wax ends', () => {
  for (let i = 0; i <= 100; i++) {
    const time = i / 100, flow = waxFlowAt(time);
    const state = waxSpreadAt(time, 768, 280);
    if (flow <= .5) assert.equal(state.label, 0);
    else if (flow < .83) assert.ok(state.label > 0 && state.label < 1);
    else assert.equal(state.label, 1);
  }
  assert.ok(waxSpreadAt(.35, 768, 280).label > 0, 'the label must already be emerging while the rim forms');
});

test('wax flow accelerates out of the center and has a much slower settling tail', () => {
  assert.equal(waxFlowAt(0), 0);
  assert.equal(waxFlowAt(1), 1);
  const firstStep = waxFlowAt(.1) - waxFlowAt(0);
  const flowingStep = waxFlowAt(.3) - waxFlowAt(.2);
  const settlingStep = waxFlowAt(.9) - waxFlowAt(.8);
  assert.ok(flowingStep > firstStep * 1.5);
  assert.ok(flowingStep > settlingStep * 6);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const flow = waxFlowAt(i / 100);
    assert.ok(flow >= previous && flow <= 1);
    previous = flow;
  }
});

test('reduced motion shows the finished seal immediately without decoding or creating a canvas', () => {
  const removed = [];
  const element = {
    querySelector() { return { decode() { assert.fail('reduced motion must not prepare an animation'); } }; },
    dataset: {}, classList: { remove(name) { removed.push(name); } },
    style: { removeProperty() {} },
  };
  const entrance = new WaxEntrance(element, { matches: true });
  assert.equal(element.dataset.waxEntrance, 'complete');
  assert.equal(entrance.done, true);
  assert.equal(entrance.events.signal.aborted, true);
  assert.deepEqual(removed, ['wax-entering']);
});
