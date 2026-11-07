import test from 'node:test';
import assert from 'node:assert/strict';
import { PaperInteraction } from './paper-interaction.mjs';
import { PaperGL } from './paper-gl.mjs';
import { PaperMaterial } from './paper-material.mjs';

const POSE = ['--paper-placement-y', '--paper-rx', '--paper-ry', '--paper-scale'];

// Anything whose style is written, keeping each write in order.
function styled(extra = {}) {
  const writes = [];
  return { writes, style: { setProperty: (name, value) => writes.push([name, value]) }, ...extra };
}
const canvas = () => ({
  setAttribute() {},
  getContext: () => ({ drawImage() {}, getImageData: (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }) }),
});

// The sheet as the page has it: two white frames (the front and its
// wordmark's) and the red back's, the front's <img> among them.
function sheet({ decoded = false } = {}) {
  const image = styled({ getAttribute: name => (name === 'width' ? '1122' : '1402'),
    decode: () => (decoded ? Promise.resolve() : new Promise(() => {})), closest: () => null });
  const frames = { white: [image, styled({ closest: () => null })], red: [styled({ closest: selector => (selector === '.paper-back' ? {} : null) })] };
  const all = [...frames.white, ...frames.red];
  const element = styled({
    // No side yet: PaperFlip, made after the sheet, marks it white side up.
    dataset: {},
    classList: { toggle() {} },
    parentElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    offsetWidth: 100, offsetHeight: 100,
    querySelector: selector => ({ img: image, '.paper-back .portfolio-frame': frames.red[0] })[selector] ?? null,
    querySelectorAll: selector => (selector === '.portfolio-frame' ? all : []),
  });
  const clear = () => { for (const target of [element, ...all]) target.writes.length = 0; };
  return { element, image, frames, all, clear };
}
const names = target => new Set(target.writes.map(([name]) => name));
const last = target => Object.fromEntries(target.writes);
const shadowOf = values => ({ '--paper-sx': `${values.sx.toFixed(4)}px`, '--paper-sy': `${values.sy.toFixed(4)}px`,
  '--paper-blur': `${values.blur.toFixed(4)}px`, '--paper-shadow-opacity': values.opacity.toFixed(4) });
const pick = (values, keys) => Object.fromEntries(keys.map(key => [key, values[key]]));

// A page around the sheet for one test, put back as it was after it; the
// sheet's warnings and errors are kept rather than printed.
async function onPage(run, patches = []) {
  const saved = Object.getOwnPropertyDescriptors(globalThis), { warn, error } = console;
  const restore = patches.map(([owner, key, value]) => { const was = owner[key]; owner[key] = value; return () => { owner[key] = was; }; });
  const logged = { warn: [], error: [] };
  console.warn = (...args) => logged.warn.push(args);
  console.error = (...args) => logged.error.push(args);
  Object.assign(globalThis, {
    addEventListener() {},
    document: { addEventListener() {}, body: { classList: { toggle() {} } }, createElement: canvas },
  });
  try {
    return await run(logged);
  } finally {
    Object.assign(console, { warn, error });
    for (const undo of restore) undo();
    for (const key of ['addEventListener', 'document']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else delete globalThis[key];
    }
  }
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a pointer moving asks for a frame, which writes the pose, the shadow only on the face showing', () => onPage(() => {
  const { element, frames, all, clear } = sheet();
  let asked = 0;
  const lit = [];
  const paper = new PaperInteraction(element, { requestFrame: () => asked++, onLight: values => lit.push(values) });
  element.dataset.paperSide = 'white';
  // As it starts, white side up: the red back, turned away, is left as it is.
  for (const frame of frames.white) assert.deepEqual(last(frame), shadowOf(paper.values));
  assert.equal(frames.red[0].writes.length, 0);
  clear();
  paper.track(80, 20, 'mouse');
  assert.equal(asked, 1);
  assert.ok(all.every(target => target.writes.length === 0) && element.writes.length === 0, 'the move itself writes no pose');
  // What lies on the sheet still hears the light, as last written.
  assert.equal(lit.at(-1), paper.values);
  assert.equal(element.dataset.interaction, 'settling');
  paper.update(0);
  assert.deepEqual(names(element), new Set(POSE));
  for (const frame of frames.white) assert.deepEqual(last(frame), shadowOf(paper.values));
  assert.equal(frames.red[0].writes.length, 0);
  // The front's shadow follows the pointer frame by frame, as before.
  const first = last(frames.white[0]);
  for (let frame = 1; frame < 4; frame++) paper.update(frame * 16);
  assert.notDeepEqual(last(frames.white[0]), first);
  assert.deepEqual(last(frames.white[0]), shadowOf(paper.values));
}));

test('both faces cast the same shadow while the sheet turns, and the face come round keeps it', () => onPage(() => {
  const { element, frames, all, clear } = sheet();
  const paper = new PaperInteraction(element, { requestFrame() {} });
  element.dataset.paperSide = 'white';
  paper.track(80, 20, 'mouse');
  for (let frame = 0; frame < 600 && paper.update(frame * 16); frame++);
  clear();
  paper.setFlipping(true);
  for (const frame of all) assert.deepEqual(last(frame), shadowOf(paper.values));
  // Turned away, the light keeps up with the pointer unseen, unwritten.
  clear();
  paper.track(10, 90, 'mouse');
  assert.ok([element, ...all].every(target => target.writes.length === 0));
  // Red side up (PaperFlip.syncFace, then onFinish): the face showing is
  // written with the pose it comes round in, the white one left as it was.
  element.dataset.paperSide = 'red';
  paper.setFlipping(false);
  assert.deepEqual(last(frames.red[0]), shadowOf(paper.values));
  for (const frame of frames.white) assert.equal(frame.writes.length, 0);
  clear();
  paper.track(50, 50, 'mouse');
  for (let frame = 0; frame < 600 && paper.update(frame * 16); frame++);
  assert.deepEqual(last(frames.red[0]), shadowOf(paper.values));
  for (const frame of frames.white) assert.equal(frame.writes.length, 0);
}));

test('with reduced motion the pose is written as the pointer moves, and on the face a turn shows', () => onPage(() => {
  const { element, frames, clear } = sheet();
  const paper = new PaperInteraction(element, { requestFrame() {}, reduced: true });
  element.dataset.paperSide = 'white';
  clear();
  paper.track(80, 20, 'mouse');
  assert.deepEqual(names(element), new Set(POSE));
  assert.deepEqual(last(frames.white[0]), shadowOf(paper.values));
  assert.equal(frames.red[0].writes.length, 0);
  assert.equal(paper.moving, false);
  // A reduced turn has no start: it finishes at once, red side up.
  clear();
  element.dataset.paperSide = 'red';
  paper.setFlipping(false);
  assert.deepEqual(last(frames.red[0]), shadowOf(paper.values));
  for (const frame of frames.white) assert.equal(frame.writes.length, 0);
}));

// Each face's preparation held until a test settles it, as PaperGL's own
// would be while it waits for an idle moment, links and decodes.
function faces(image) {
  const held = {}, order = [], after = {};
  for (const face of ['front', 'back']) held[face] = Promise.withResolvers();
  const face = gl => (gl.image === image ? 'front' : 'back');
  return {
    held, order, after,
    patches: [
      [PaperGL.prototype, 'prepare', function (options) {
        order.push(`${face(this)} prepare`);
        after[face(this)] = options?.after;
        return held[face(this)].promise;
      }],
      [PaperGL.prototype, 'discard', function () { order.push(`${face(this)} discard`); }],
      [PaperMaterial.prototype, 'prepare', async function () { order.push('relief prepare'); }],
    ],
  };
}

test('the front unlit falls back at once, the back put away then, wherever it has got to', async () => {
  for (const back of ['preparing', 'ready', 'failed']) {
    const page = sheet({ decoded: true }), { held, order, patches } = faces(page.image);
    await onPage(async logged => {
      const paper = new PaperInteraction(page.element, { requestFrame() {} });
      await settle();
      assert.deepEqual(order, ['front prepare', 'back prepare']);
      if (back === 'ready') held.back.resolve();
      if (back === 'failed') held.back.reject(new Error('Paper relief: 404'));
      await settle();
      held.front.reject(new Error('Paper relief: 404'));
      const settled = await Promise.race([paper.ready.then(() => true), settle().then(() => false)]);
      assert.equal(settled, true, 'the sheet is ready on its fallback, whatever the back is doing');
      assert.ok(paper.material instanceof PaperMaterial);
      assert.deepEqual(order, ['front prepare', 'back prepare', 'back discard', 'relief prepare']);
      // A back put away mid-way stops (PaperGL.prepare rejects): it is never lit.
      if (back === 'preparing') held.back.reject(new Error('Paper lighting: put away'));
      await settle();
      assert.equal(paper.backMaterial, undefined);
      assert.equal(order.length, 4);
      assert.deepEqual(logged.warn.map(([label]) => label), ['Paper lighting:']);
      assert.deepEqual(logged.error, []);
    }, patches);
  }
});

test('a back that fails alone leaves the front lit', async () => {
  const page = sheet({ decoded: true }), { held, order, patches } = faces(page.image);
  await onPage(async logged => {
    const paper = new PaperInteraction(page.element, { requestFrame() {} });
    await settle();
    held.front.resolve();
    await settle();
    assert.ok(paper.material instanceof PaperGL);
    held.back.reject(new Error('Paper relief: 404'));
    await paper.ready;
    assert.equal(paper.backMaterial, undefined);
    assert.deepEqual(order, ['front prepare', 'back prepare']);
    assert.deepEqual(logged.warn.map(([label]) => label), ['Paper lighting (back):']);
  }, patches);
});

test('the sheet is ready once both faces are lit, the back before it can ever be seen', async () => {
  const page = sheet({ decoded: true }), { held, order, after, patches } = faces(page.image);
  await onPage(async logged => {
    const paper = new PaperInteraction(page.element, { requestFrame() {} });
    let ready = false;
    paper.ready.then(() => { ready = true; });
    await settle();
    // The back's context and shaders follow the front's (PaperGL.prepare).
    assert.equal(after.front, undefined);
    assert.equal(after.back, held.front.promise);
    held.front.resolve();
    await settle();
    assert.equal(ready, false, 'not ready while the back is still being made ready');
    held.back.resolve();
    await paper.ready;
    assert.ok(paper.material instanceof PaperGL && paper.backMaterial instanceof PaperGL);
    assert.notEqual(paper.material, paper.backMaterial);
    assert.deepEqual(order, ['front prepare', 'back prepare']);
    assert.deepEqual(logged.warn, []);
    assert.deepEqual(pick(page.element.dataset, ['paperReady']), { paperReady: 'true' });
  }, patches);
});
