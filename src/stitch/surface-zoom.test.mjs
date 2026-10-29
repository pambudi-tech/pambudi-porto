import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceCamera, mountSurfaceNavigation } from './surface-zoom.mjs';
import { GRID, StitchModel } from './model.mjs';
import { FreeStitch } from './free-stitch.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const cellAt = (view, x, y) => [Math.floor((x - view.x) / (GRID * view.scale)), Math.floor((y - view.y) / (GRID * view.scale))];

test('zoom holds the exact world point beneath an off-center pointer, including at both limits', () => {
  const view = { x: 0, y: 0, scale: 1 }, camera = new SurfaceCamera(view);
  camera.resize(1280, 900, .37);
  const x = 213, y = 317, point = [(x - view.x) / view.scale, (y - view.y) / view.scale];
  for (const multiplier of [1.25, 1.25, .8, 1000, 10, .00001, .01]) {
    camera.zoomBy(multiplier, x, y);
    near((x - view.x) / view.scale, point[0]);
    near((y - view.y) / view.scale, point[1]);
    assert.ok(camera.factor >= .25 && camera.factor <= 8);
  }
});

test('drawing, unpicking, and history address the same stitch after zoom and pan', () => {
  const view = { x: 0, y: 0, scale: 1 }, camera = new SurfaceCamera(view);
  camera.resize(1280, 900, .37);
  const model = new StitchModel(), free = new FreeStitch(model, new Map());
  const cell = cellAt(view, 213, 317);
  free.begin(cell, 0, true);
  free.finish();
  camera.zoomBy(4, 213, 317);
  camera.pan(73, -28);
  assert.deepEqual(cellAt(view, 286, 289), cell);
  free.tool = 'unpick';
  free.begin(cellAt(view, 286, 289), 1, true);
  free.finish();
  assert.equal(model.stitches.size, 0);
  model.undo();
  assert.equal(model.stitches.get(cell.join(',')), free.color);
  const before = { ...view };
  model.redo();
  assert.equal(model.stitches.size, 0);
  assert.deepEqual(view, before);
});

test('resize across mobile and desktop preserves zoom and the center world point', () => {
  const view = { x: 0, y: 0, scale: 1 }, camera = new SurfaceCamera(view);
  camera.resize(1280, 900, .37);
  camera.zoomBy(3, 123, 312);
  camera.pan(50, -20);
  const center = [(640 - view.x) / view.scale, (450 - view.y) / view.scale];
  for (const [width, height, base] of [[390, 844, .23], [320, 568, .2], [1280, 900, .37]]) {
    camera.resize(width, height, base);
    assert.equal(camera.factor, 3);
    near((width / 2 - view.x) / view.scale, center[0]);
    near((height / 2 - view.y) / view.scale, center[1]);
  }
  camera.reset();
  assert.deepEqual(view, { x: 640, y: 450, scale: .37 });
  assert.equal(camera.factor, 1);
});

test('a pinch can scale and translate together while keeping the same world point beneath the fingers', () => {
  const view = { x: 0, y: 0, scale: 1 }, camera = new SurfaceCamera(view);
  camera.resize(390, 844, .23);
  const old = { x: 150, y: 310 }, next = { x: 170, y: 340 };
  const point = [(old.x - view.x) / view.scale, (old.y - view.y) / view.scale];
  camera.zoomBy(1.8, old.x, old.y);
  camera.pan(next.x - old.x, next.y - old.y);
  near(point[0] * view.scale + view.x, next.x);
  near(point[1] * view.scale + view.y, next.y);
});

test('pinching consumes both releases without stitching, then allows an ordinary tap again', () => {
  const previous = { window: globalThis.window, document: globalThis.document };
  const buttons = new Map(['zoom-in', 'zoom-out', 'zoom-reset'].map(id => [id, new EventTarget()]));
  const surface = new EventTarget();
  surface.classList = { add() {}, remove() {} };
  surface.setPointerCapture = () => {};
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { getElementById: id => buttons.get(id) });
  try {
    const view = { x: 0, y: 0, scale: 1 }, camera = new SurfaceCamera(view);
    camera.resize(390, 844, .23);
    let starts = 0, releases = 0;
    mountSurfaceNavigation(surface, camera, { onStart() { starts++; }, onChange() {} });
    surface.addEventListener('pointerup', () => { releases++; });
    const pointer = (type, id, x) => {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, { pointerType: 'touch', pointerId: id, clientX: x, clientY: 300 });
      surface.dispatchEvent(event);
    };
    pointer('pointerdown', 1, 100);
    pointer('pointerdown', 2, 200);
    pointer('pointermove', 2, 250);
    near(camera.factor, 1.5);
    pointer('pointerup', 1, 100);
    pointer('pointermove', 2, 260);
    pointer('pointerup', 2, 260);
    assert.equal(starts, 1);
    assert.equal(releases, 0);
    pointer('pointerdown', 3, 120);
    pointer('pointerup', 3, 120);
    assert.equal(releases, 1);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
