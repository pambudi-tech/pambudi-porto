import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceRenderer, threadSprite, preparedSprites, SPRITE } from './render.mjs';

function recordedAnimation(kind, time) {
  const calls = [];
  const context = new Proxy({}, {
    set(target, key, value) { calls.push([key, value]); target[key] = value; return true; },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push([key, ...args]);
    },
  });
  const renderer = Object.create(SurfaceRenderer.prototype);
  renderer.gesture = context;
  renderer.clear = () => {};
  renderer.world = () => {};
  renderer.drawInteraction({}, new Map([['0,0', { kind, color: 'garnet', started: 0, duration: 400 }]]), null, 'garnet', 'stitch', time, false);
  return calls;
}

test('unpick renders the exact reverse geometry of stitch creation, with no fading or lift', () => {
  for (const time of [0, 100, 200, 300, 400]) {
    const forward = recordedAnimation('add', time);
    const backward = recordedAnimation('erase', 400 - time);
    assert.deepEqual(backward, forward);
    assert.equal(backward.some(([operation]) => operation === 'globalAlpha'), false);
    assert.ok(backward.filter(([operation]) => operation === 'translate').every(([, x, y]) => x === 0 && y === 0));
  }
});

test('a queued unpick keeps the whole stitch visible until its reverse animation starts', () => {
  assert.deepEqual(recordedAnimation('erase', -50), recordedAnimation('add', 400));
});

test('the bird shares the stitch canvas while permanent embroidery and history retain their cells', () => {
  const calls = [];
  const renderer = Object.create(SurfaceRenderer.prototype);
  renderer.stitch = { drawImage: (sprite, ...bounds) => calls.push({ ...sprite, bounds }) };
  renderer.clear = () => {};
  renderer.world = () => {};
  renderer.sprite = (color, variation, progress = 1) => ({ color, progress });
  renderer.width = renderer.height = 800;
  renderer.resolveCell = (col, row) => col === -1000 ? [3, 5] : [col, row];
  const model = { stitches: new Map([['-1000,0', '#353630'], ['4,5', 'garnet']]), undoStack: [] };
  const original = [...model.stitches];
  const moving = new Map([
    ['3,5', { col: 3, row: 5, color: 'bird', progress: 1 }],
    ['4,5', { col: 4, row: 5, color: 'bird', progress: .5 }],
    ['6,5', { col: 6, row: 5, color: 'bird', progress: .5 }],
  ]);
  const view = { x: 0, y: 0, scale: 1 };
  renderer.drawStitches(model, view, new Map(), moving);
  assert.deepEqual(calls.map(call => call.color), ['#353630', 'garnet', 'bird']);
  assert.deepEqual(calls[2], { color: 'bird', progress: .5, bounds: [6 * 22 - 5, 5 * 22 - 5, 32, 32] });
  calls.length = 0;
  renderer.drawStitches(model, view);
  assert.deepEqual(calls.map(call => call.color), ['#353630', 'garnet']);
  assert.deepEqual([...model.stitches], original);
  assert.deepEqual(model.undoStack, []);
});

test('settled embroidery is drawn once to a layer, then only copied while the bird moves', () => {
  const layerCalls = [], screenCalls = [];
  const renderer = Object.create(SurfaceRenderer.prototype);
  renderer.stitch = {
    setTransform() {}, save() {}, restore() {}, beginPath() {}, clip() {}, clearRect() {},
    rect: (...box) => screenCalls.push(`clip ${box}`),
    drawImage: image => screenCalls.push(image.color ?? 'layer'),
  };
  renderer.stitchCanvas = { width: 1600, height: 1600 };
  renderer.layer = { getContext: () => ({ drawImage: image => layerCalls.push(image.color) }) };
  renderer.clear = context => { if (context === renderer.stitch) screenCalls.push('clear'); };
  renderer.world = () => {};
  renderer.sprite = (color, variation, progress = 1) => ({ color, progress });
  renderer.width = renderer.height = 800;
  renderer.dpr = 2;
  const model = { stitches: new Map([['1,1', 'garnet'], ['2,1', 'pine']]) };
  const view = { x: 0, y: 0, scale: 1 };
  const bird = new Map([['2,1', { col: 2, row: 1, color: 'bird', progress: 1 }], ['5,5', { col: 5, row: 5, color: 'bird', progress: 1 }]]);
  for (let frame = 0; frame < 3; frame++) renderer.drawStitches(model, view, new Map(), bird, null, frame, { settled: true });
  assert.deepEqual(layerCalls, ['garnet', 'pine'], 'the layer is drawn once');
  // The first frame is drawn whole; after it, only the bird's box is cleared
  // and copied again (5,5 is 105 to 137 units, 210 to 274 px, 2 px margin).
  assert.deepEqual(screenCalls, ['clear', 'layer', 'bird', 'clip 208,208,68,68', 'layer', 'bird', 'clip 208,208,68,68', 'layer', 'bird'], 'the bird skips the stitched cell');
  // As the bird moves, the box holds where it was and where it is now.
  screenCalls.length = 0;
  bird.set('5,5', { col: 6, row: 5, color: 'bird', progress: 1 });
  renderer.drawStitches(model, view, new Map(), new Map([['6,5', bird.get('5,5')]]), null, 3, { settled: true });
  assert.deepEqual(screenCalls, ['clip 208,208,112,68', 'layer', 'bird']);
  // Away off screen, there is nothing left to draw once its last place is cleared.
  screenCalls.length = 0;
  for (let frame = 4; frame < 7; frame++) renderer.drawStitches(model, view, new Map(), new Map([['90,90', { col: 90, row: 90, color: 'bird', progress: 1 }]]), null, frame, { settled: true });
  assert.deepEqual(screenCalls, ['clip 252,208,68,68', 'layer']);
  // A change to the stitches redraws the layer on the next settled frame,
  // and the canvas whole.
  model.stitches.set('1,1', 'pine');
  renderer.invalidate();
  layerCalls.length = screenCalls.length = 0;
  renderer.drawStitches(model, view, new Map(), new Map(), null, 3, { settled: true });
  assert.deepEqual(layerCalls, ['pine', 'pine']);
  assert.deepEqual(screenCalls, ['clear', 'layer']);
  // While anything animates, every stitch is drawn directly and the layer is
  // rebuilt once things settle again.
  layerCalls.length = screenCalls.length = 0;
  renderer.drawStitches(model, view, new Map(), new Map(), null, 4);
  assert.deepEqual(screenCalls, ['clear', 'pine', 'pine']);
  renderer.drawStitches(model, view, new Map(), new Map(), null, 5, { settled: true });
  assert.deepEqual(layerCalls, ['pine', 'pine']);
  // A resize clears the canvas, so the frame after it is drawn whole too.
  screenCalls.length = 0;
  renderer.drawStitches(model, view, new Map(), bird, null, 6, { settled: true });
  renderer.shows = null;
  renderer.drawStitches(model, view, new Map(), bird, null, 7, { settled: true });
  assert.deepEqual(screenCalls, ['clip 252,208,68,68', 'layer', 'bird', 'clear', 'layer', 'bird']);
});

test('the gesture canvas is drawn again only when its hover or a sewing stitch would change it', () => {
  const calls = [];
  const renderer = Object.create(SurfaceRenderer.prototype);
  renderer.gesture = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => ({ addColorStop() {} }), set: (target, key, value) => { target[key] = value; return true; } });
  renderer.clear = () => calls.push('clear');
  renderer.world = () => {};
  const view = { x: 0, y: 0, scale: 1 };
  const draw = (hover, { animations = new Map(), color = 'garnet', mode = 'motif', keyboard = false, at = view } = {}) => {
    calls.length = 0;
    renderer.drawInteraction(at, animations, hover, color, mode, 0, keyboard);
    return calls.length > 0;
  };
  assert.equal(draw(null), true, 'the first frame clears it');
  assert.equal(draw(null), false);
  assert.equal(draw({ col: 1, row: 2, x: 30, y: 50 }), true);
  assert.equal(draw({ col: 1, row: 2, x: 32, y: 51 }), false, 'the hover cross steps between holes, not with the pointer');
  assert.equal(draw({ col: 1, row: 2, x: 32, y: 51 }, { mode: 'stitch' }), true);
  assert.equal(draw({ col: 1, row: 2, x: 33, y: 51 }, { mode: 'stitch' }), true, 'the needle follows the pointer');
  assert.equal(draw({ col: 1, row: 2, x: 33, y: 51 }, { mode: 'stitch', keyboard: true }), true);
  assert.equal(draw({ col: 1, row: 2, x: 34, y: 51 }, { mode: 'stitch', keyboard: true }), false, 'no needle with the keyboard');
  assert.equal(draw({ col: 1, row: 2, x: 34, y: 51 }, { mode: 'stitch', keyboard: true, color: 'pine' }), true);
  assert.equal(draw({ col: 1, row: 2, x: 34, y: 51 }, { mode: 'stitch', keyboard: true, color: 'pine', at: { x: 1, y: 0, scale: 1 } }), true);
  const sewing = new Map([['0,0', { kind: 'add', color: 'garnet', started: 0, duration: 400 }]]);
  assert.equal(draw(null, { animations: sewing }), true);
  assert.equal(draw(null, { animations: sewing }), true, 'a stitch sewing in is drawn every frame');
  assert.equal(draw(null), true, 'and cleared once it is done');
  assert.equal(draw(null, { animations: new Map([['0,0', { kind: 'motif' }], ['1,0', { kind: 'unpick' }]]) }), false, 'motifs and unpicking are on the stitch canvas');
  renderer.gestureShows = null;
  assert.equal(draw(null), true, 'after a resize');
});

test('the sprite cache lets go of the same sprites as it always has, without looking through every key', () => {
  // The cache as it was: past 768 sprites, the oldest still mid-stitch goes,
  // or else the oldest of all, found by looking through every key.
  const reference = new Map();
  const request = (color, variation, step) => {
    const key = `${color}:${variation}:${step}`;
    if (reference.has(key)) return;
    if (reference.size > 768) {
      const transient = [...reference.keys()].find(key => !key.endsWith(':12'));
      reference.delete(transient ?? reference.keys().next().value);
    }
    reference.set(key, preparedSprites.get(key));
  };
  const colors = Array.from({ length: 9 }, (_, i) => `#0000${i}0`);
  for (const color of colors) for (let variation = 0; variation < 8; variation++) for (let step = 0; step <= SPRITE.steps; step++) {
    preparedSprites.set(`${color}:${variation}:${step}`, { color, variation, step });
  }
  const sprites = new Map();
  let seed = 3;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 6000; i++) {
    // Mostly finished stitches, as on the page, some mid-stitch.
    const color = colors[Math.floor(random() * colors.length)], variation = Math.floor(random() * 8);
    const step = random() < .6 ? SPRITE.steps : Math.floor(random() * SPRITE.steps);
    request(color, variation, step);
    assert.equal(threadSprite(sprites, color, variation, step / SPRITE.steps), preparedSprites.get(`${color}:${variation}:${step}`));
    if (i % 50 === 0 || sprites.size !== reference.size) assert.deepEqual([...sprites.keys()], [...reference.keys()], `request ${i}`);
  }
  assert.deepEqual([...sprites.keys()], [...reference.keys()]);
  for (const key of [...preparedSprites.keys()]) if (key.startsWith('#0000')) preparedSprites.delete(key);
});
