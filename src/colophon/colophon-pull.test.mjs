import test from 'node:test';
import assert from 'node:assert/strict';
import { ColophonPull } from './colophon-pull.mjs';
import { PULL } from './pull-physics.mjs';

// Just enough of a page for the pull's listeners: elements are event
// targets in a parent chain, the window another target. Events don't bubble
// here, so a test hands one to each target on its way up, as a browser would.
class Node extends EventTarget {
  constructor(parent = null, children = {}) {
    super();
    this.parent = parent;
    this.children = children;
    this.dataset = {};
    this.style = {};
    this.inert = false;
    this.hidden = true;
  }
  contains(node) {
    for (let at = node; at; at = at.parent) if (at === this) return true;
    return false;
  }
  closest() { return null; }
  querySelector(selector) { return this.children[selector] ?? null; }
  setAttribute() {}
  removeAttribute() {}
  focus() {}
}

function page(t) {
  const win = new EventTarget();
  const globals = {
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
    innerHeight: 800,
    innerWidth: 390,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    document: { body: { dataset: { ready: 'true' } }, activeElement: null },
  };
  const previous = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.mock.method(globalThis, 'setTimeout', () => 0);
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const surface = new Node();
  const paper = new Node(surface);
  paper.dataset.paperSide = 'white';
  surface.children['.portfolio-paper'] = paper;
  const clock = new Node();
  const panel = new Node();
  Object.assign(panel, { scrollTop: 0, scrollHeight: 300, clientHeight: 300, offsetHeight: 300 });
  const scene = { canLift: () => true, letGo() {}, announce() {} };
  // The dot clock, as the pull holds its canvas whole: each call, and how far the page lay then.
  const holds = [];
  const dots = { holdWhole: held => holds.push([held, pull.lift, clock.style.transform || '']) };
  const pull = new ColophonPull({ scene, panel, layers: [surface, clock], motionPreference: { matches: true }, clock: dots });
  t.after(() => {
    pull.destroy();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return { win, surface, paper, pull, holds };
}

const wheel = deltaY => Object.assign(new Event('wheel', { cancelable: true }), { deltaY, deltaMode: 0, ctrlKey: false, clientY: 20 });

// Which targets hear the pull's wheel.
function listening({ win, surface, pull }) {
  const heard = [];
  const real = pull.wheelBy;
  pull.wheelBy = event => heard.push(event.currentTarget);
  surface.dispatchEvent(wheel(-10));
  win.dispatchEvent(wheel(-10));
  pull.wheelBy = real;
  return { page: heard.includes(surface), window: heard.includes(win) };
}

test('the wheel is heard on the page only while its paper lies white side up', t => {
  const site = page(t);
  const { paper } = site;
  assert.deepEqual(listening(site), { page: true, window: false });
  // The paper turns to About.
  paper.dataset.flipping = 'true';
  paper.dispatchEvent(new Event('paperflipstart'));
  assert.deepEqual(listening(site), { page: false, window: false });
  paper.dataset.flipping = 'false';
  paper.dataset.paperSide = 'red';
  paper.dispatchEvent(new CustomEvent('paperflipend', { detail: { red: true } }));
  assert.deepEqual(listening(site), { page: false, window: false });
  // And back.
  paper.dataset.flipping = 'true';
  paper.dispatchEvent(new Event('paperflipstart'));
  paper.dataset.flipping = 'false';
  paper.dataset.paperSide = 'white';
  paper.dispatchEvent(new CustomEvent('paperflipend', { detail: { red: false } }));
  assert.deepEqual(listening(site), { page: true, window: false });
  // The works row turns the paper away and makes it inert while it is open.
  paper.inert = true;
  paper.dispatchEvent(new Event('paperflipstart'));
  assert.deepEqual(listening(site), { page: false, window: false });
  paper.inert = false;
  paper.dispatchEvent(new CustomEvent('paperflipend', { detail: { red: false } }));
  assert.deepEqual(listening(site), { page: true, window: false });
});

test('the window hears the wheel only while the page is pulled', t => {
  const site = page(t);
  const { pull } = site;
  pull.begin();
  assert.equal(listening(site).window, true);
  pull.rest();
  assert.deepEqual(listening(site), { page: true, window: false });
});

test('a wheel that begins a pull pulls once, though the window then hears it too', t => {
  const { win, surface, pull } = page(t);
  const event = wheel(-100);
  surface.dispatchEvent(event);
  // The same event, on its way up to the window, which now listens.
  win.dispatchEvent(event);
  assert.ok(event.defaultPrevented);
  assert.equal(pull.wheel.pull, 100 * PULL.wheelScale);
  // The next one is the window's alone: the page is inert while pulled.
  win.dispatchEvent(wheel(-100));
  assert.equal(pull.wheel.pull, 200 * PULL.wheelScale);
});

test('the clock is held on its whole canvas from the moment a pull begins until the page is home', t => {
  const { pull, holds } = page(t);
  assert.deepEqual(holds, []);
  pull.begin();
  assert.deepEqual(holds, [[true, 0, '']], 'held at home, before the page moves');
  pull.toOpen(0);
  assert.equal(pull.lift, 300);
  pull.close();
  assert.deepEqual(holds, [[true, 0, ''], [false, 0, '']], 'let go only once home again');
  // A resize mid-pull sends it home at once, and lets go too.
  pull.begin();
  pull.toOpen(0);
  pull.settleNow();
  assert.deepEqual(holds.slice(2), [[true, 0, ''], [false, 0, '']]);
});
