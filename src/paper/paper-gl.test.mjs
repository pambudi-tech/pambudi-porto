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

test('the sheet\'s texels come from its file, uncorrected, else from the <img>', async () => {
  const { paperTexels } = await import('./paper-gl.mjs');
  const image = { currentSrc: '/assets/paper-800w.webp', src: '/assets/paper.webp' };
  const calls = [], saved = Object.getOwnPropertyDescriptors(globalThis);
  try {
    globalThis.fetch = async url => { calls.push(url); return { ok: true, blob: async () => 'blob' }; };
    globalThis.createImageBitmap = async (blob, options) => ({ blob, options });
    assert.deepEqual(await paperTexels(image), { blob: 'blob', options: { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } });
    assert.deepEqual(calls, ['/assets/paper-800w.webp']);
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    assert.equal(await paperTexels(image), image);
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    assert.equal(await paperTexels(image), image);
  } finally {
    for (const key of ['fetch', 'createImageBitmap']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else delete globalThis[key];
    }
  }
});

// A page with a graphics card, just enough for PaperGL to make itself ready,
// keeping what it asks for and what it lets go; put back as it was after.
async function withCard(run, { relief = true } = {}) {
  const keys = ['window', 'document', 'requestIdleCallback', 'requestAnimationFrame', 'fetch', 'createImageBitmap',
    'ResizeObserver', 'getComputedStyle', 'devicePixelRatio'];
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const log = { contexts: 0, lost: 0, closed: [], fetched: [], observing: 0, inserted: 0, removed: 0, drawn: 0 };
  const idle = [];
  const gl = new Proxy({
    getExtension: name => ({ WEBGL_debug_renderer_info: { UNMASKED_RENDERER_WEBGL: 'renderer' },
      WEBGL_lose_context: { loseContext: () => log.lost++ } })[name] ?? null,
    getParameter: () => 'Apple M2',
    getProgramParameter: () => true,
    drawArrays: () => log.drawn++,
  }, { get: (target, key) => target[key] ?? (() => ({})) });
  const element = () => ({ dataset: {}, setAttribute() {}, addEventListener() {}, remove: () => log.removed++,
    getContext: () => { log.contexts++; return gl; } });
  Object.assign(globalThis, {
    document: { createElement: element },
    requestIdleCallback: resolve => idle.push(resolve),
    requestAnimationFrame: callback => setImmediate(callback),
    fetch: async url => { log.fetched.push(url); return url.includes('relief') && !relief ? { ok: false, status: 404 } : { ok: true, blob: async () => url }; },
    createImageBitmap: async blob => ({ blob, width: 64, height: 80, close() { log.closed.push(blob); } }),
    ResizeObserver: class { observe() { log.observing++; } disconnect() { log.observing--; } },
    getComputedStyle: () => ({}),
    devicePixelRatio: 2,
  });
  globalThis.window = globalThis;
  const image = { currentSrc: '/assets/paper-back.webp', decode: async () => {}, getAttribute: name => (name === 'width' ? '1122' : '1402'),
    offsetWidth: 300, offsetHeight: 375, after: () => log.inserted++ };
  try {
    const { PaperGL } = await import('./paper-gl.mjs');
    return await run({ paper: new PaperGL(image, 'red'), log, idle: () => idle.shift()?.() });
  } finally {
    for (const key of keys) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else delete globalThis[key];
    }
  }
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a sheet put away while it waits to be made ready asks for nothing more', () => withCard(async ({ paper, log, idle }) => {
  const prepared = paper.prepare();
  paper.discard();
  idle();
  await assert.rejects(prepared, /put away/);
  assert.deepEqual([log.contexts, log.inserted, log.observing], [0, 0, 0]);
}));

test('a sheet put away while it decodes lets its pictures go and is never shown', () => withCard(async ({ paper, log, idle }) => {
  const prepared = paper.prepare();
  idle();
  await Promise.resolve();
  assert.equal(log.contexts, 1);
  paper.discard();
  await assert.rejects(prepared, /put away/);
  await settle();
  assert.equal(log.lost, 1);
  assert.deepEqual(log.closed.sort(), ['/assets/paper-back-relief.webp', '/assets/paper-back.webp']);
  assert.deepEqual([log.inserted, log.observing, log.drawn], [0, 0, 0]);
}));

test('a sheet whose relief fails lets its decoded picture go', () => withCard(async ({ paper, log, idle }) => {
  const prepared = paper.prepare();
  idle();
  await assert.rejects(prepared, /Paper relief: 404/);
  await settle();
  assert.deepEqual(log.closed, ['/assets/paper-back.webp']);
  assert.deepEqual([log.inserted, log.observing], [0, 0]);
}, { relief: false }));

test('a sheet put away once ready is taken off the page with its context and observer', () => withCard(async ({ paper, log, idle }) => {
  const prepared = paper.prepare();
  idle();
  await prepared;
  assert.deepEqual([log.inserted, log.observing, log.drawn], [1, 1, 1]);
  // Both pictures are uploaded and let go, as before.
  assert.equal(log.closed.length, 2);
  paper.discard();
  assert.deepEqual([log.removed, log.lost, log.observing], [1, 1, 0]);
  paper.draw({ lx: 1, ly: 0, light: 1 });
  assert.equal(log.drawn, 1);
}));

// The back, held until the front is ready (paper-interaction.mjs).
test('a sheet held back fetches its pictures meanwhile, and makes its context only once let go', () => withCard(async ({ paper, log, idle }) => {
  const front = Promise.withResolvers();
  const prepared = paper.prepare({ after: front.promise });
  idle();
  await settle();
  assert.deepEqual(log.fetched.sort(), ['/assets/paper-back-relief.webp', '/assets/paper-back.webp']);
  assert.deepEqual([log.contexts, log.inserted], [0, 0]);
  front.resolve();
  await prepared;
  assert.deepEqual([log.contexts, log.inserted, log.observing, log.drawn], [1, 1, 1, 1]);
  assert.equal(log.fetched.length, 2, 'its pictures are fetched once');
  assert.equal(log.closed.length, 2);
}));

test('a sheet held back by a front that fails is never made, and lets its pictures go', () => withCard(async ({ paper, log, idle }) => {
  const front = Promise.withResolvers();
  const prepared = paper.prepare({ after: front.promise });
  idle();
  await settle();
  front.reject(new Error('Paper relief: 404'));
  await assert.rejects(prepared, /Paper relief: 404/);
  await settle();
  assert.deepEqual([log.contexts, log.inserted, log.observing], [0, 0, 0]);
  assert.deepEqual(log.closed.sort(), ['/assets/paper-back-relief.webp', '/assets/paper-back.webp']);
}));

test('a sheet put away while held back is never made, and lets its pictures go', () => withCard(async ({ paper, log, idle }) => {
  const front = Promise.withResolvers();
  const prepared = paper.prepare({ after: front.promise });
  idle();
  await settle();
  paper.discard();
  front.resolve();
  await assert.rejects(prepared, /put away/);
  await settle();
  assert.deepEqual([log.contexts, log.inserted, log.observing], [0, 0, 0]);
  assert.equal(log.closed.length, 2);
}));

test('a relief that fails while its sheet is held back fails the sheet once let go, unreported before', () => withCard(async ({ paper, log, idle }) => {
  const front = Promise.withResolvers();
  const prepared = paper.prepare({ after: front.promise });
  idle();
  await settle();
  await settle();
  front.resolve();
  await assert.rejects(prepared, /Paper relief: 404/);
  await settle();
  assert.deepEqual([log.inserted, log.observing], [0, 0]);
  assert.deepEqual(log.closed, ['/assets/paper-back.webp']);
}, { relief: false }));
