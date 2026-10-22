import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeInkFrame, createNativeInkLayer } from './native-ink.mjs';

test('the last tenth is already the exact resting text, with no remaining wet layer', () => {
  const final = nativeInkFrame(1);
  assert.equal(nativeInkFrame(0).opacity, 0);
  assert.equal(final.opacity, 1);
  assert.ok(Math.abs(final.intercept - 1) < 1e-12);
  assert.equal(final.soak, 0);
  for (const progress of [.9, .95, .99, 1, 1.1]) assert.deepEqual(nativeInkFrame(progress), final);
});

test('revealing and cleanup preserve the original DOM lettering and existing filters', t => {
  const makeNode = name => ({
    name, attributes: {}, children: [],
    setAttribute(key, value) { this.attributes[key] = value; },
    append(...nodes) { this.children.push(...nodes); },
    remove() { this.removed = true; },
  });
  const body = makeNode('body');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElementNS: (_, name) => makeNode(name), body } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  const textNode = Object.freeze({ textContent: 'House of Pambudi' });
  const paragraph = { childNodes: Object.freeze([textNode]), style: { filter: 'contrast(1)' } };
  const layer = createNativeInkLayer(paragraph, 'data:image/png;base64,mask', { width: 400, height: 80, padding: 8 });
  assert.match(paragraph.style.filter, /contrast\(1\) url\("#entrance-ink-/);
  for (const progress of [0, .3, .7, .9, 1]) layer.draw(progress);
  layer.finish();
  layer.finish();
  assert.deepEqual(paragraph.childNodes, [textNode]);
  assert.equal(paragraph.childNodes[0], textNode);
  assert.equal(paragraph.style.filter, 'contrast(1)');
  assert.equal(body.children[0].removed, true);
  assert.ok(!body.children[0].children.some(node => node.name === 'canvas'));
});
