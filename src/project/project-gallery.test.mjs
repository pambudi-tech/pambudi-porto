import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPTH, depthOrder, galleryPlacement, depthOpacity, depthBlur, galleryCurrent, galleryMeeting, gallerySpotOf, wheelScrolls, sheetLayout, sheetProgress, stampSize, SHEET } from './project-gallery.mjs';
import { fitRect, panTo, zoomAt, CLOSEUP } from './project-closeup.mjs';

const SCREENS = {
  desktop: { width: 1440, height: 900, w: 662, h: 497 },
  phone: { width: 390, height: 844, w: 304, h: 228 },
};
// A stamp's rectangle on screen, `depth` spacings behind the camera.
const shown = (index, depth, room) => {
  const scale = DEPTH.perspective / (DEPTH.perspective + depth * DEPTH.spacing);
  const { x, y } = galleryPlacement(index, { ...room, scale });
  return { x0: x - room.w * scale / 2, x1: x + room.w * scale / 2, y0: y - room.h * scale / 2, y1: y + room.h * scale / 2 };
};
// The share of the stamp `depth` behind stamp `at` that the nearer ones leave in view.
const uncovered = (at, depth, room) => {
  const target = shown(at + depth, depth, room), nearer = Array.from({ length: depth }, (_, k) => shown(at + k, k, room));
  let seen = 0;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 30; j++) {
    const px = target.x0 + (i + .5) / 40 * (target.x1 - target.x0), py = target.y0 + (j + .5) / 30 * (target.y1 - target.y0);
    if (!nearer.some(r => px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1)) seen++;
  }
  return seen / 1200;
};

test('a stamp at the camera always fits on screen, the same on every visit', () => {
  for (const room of Object.values(SCREENS)) {
    for (let index = 0; index < 12; index++) {
      const r = shown(index, 0, room);
      assert.ok(r.x0 >= -room.width / 2 + DEPTH.side - 1e-9 && r.x1 <= room.width / 2 - DEPTH.side + 1e-9);
      assert.ok(r.y0 + room.height / 2 >= DEPTH.top - 1e-9 && r.y1 + room.height / 2 <= room.height - DEPTH.bottom + 1e-9);
    }
  }
  assert.deepEqual(galleryPlacement(3, SCREENS.desktop), galleryPlacement(3, SCREENS.desktop));
});

test('from any stamp, the two behind it show around it', () => {
  for (const [name, room] of Object.entries(SCREENS)) {
    for (let at = 0; at < 12; at++) {
      assert.ok(uncovered(at, 1, room) >= .35, `${name}: the next behind stamp ${at}`);
      assert.ok(uncovered(at, 2, room) >= .35, `${name}: the second behind stamp ${at}`);
    }
  }
});

test('stamps behind are blurred, not faded, but for the far fog and as they pass', () => {
  assert.equal(depthOpacity(0), 1);
  assert.equal(depthOpacity(-DEPTH.spacing * 2), 1);
  assert.equal(depthOpacity(DEPTH.pass), 0);
  assert.equal(depthOpacity(-DEPTH.spacing * DEPTH.fog), 0);
  assert.equal(depthBlur(0), 0);
  assert.ok(depthBlur(-DEPTH.spacing * 2) > depthBlur(-DEPTH.spacing));
  assert.equal(depthBlur(-DEPTH.spacing * 99), DEPTH.blurMost);
});

test('the depth goes on for ever: past the last stamp, the first comes round', () => {
  const s = DEPTH.spacing;
  assert.equal(galleryCurrent(0, 4), 0);
  assert.equal(galleryCurrent(s * .6, 4), 1);
  assert.equal(galleryCurrent(s * 9, 4), 1);
  // At spot 3 of 3 stamps, the first is met again, in front.
  assert.deepEqual(galleryMeeting(0, s * 3, 3), { spot: 3, z: 0 });
  assert.deepEqual(galleryMeeting(1, s * 3, 3), { spot: 4, z: -s });
  // Nothing is met before the spot where the gallery opens.
  assert.ok(galleryMeeting(2, 0, 3).spot >= 0);
  // A stamp by its number, at the spot nearest the camera's.
  assert.equal(gallerySpotOf(0, 5, 3), 6);
  assert.equal(gallerySpotOf(2, 5, 3), 5);
  assert.equal(gallerySpotOf(1, 0, 3), 1);
});

// A trackpad scroll: the fingers' push, wobbling, then momentum fading out.
let seed = 7;
const wobble = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - .5;
const push = (speed, count, way = 1) => Array.from({ length: count }, (_, i) => way * Math.max(1, Math.round(speed * Math.min(1, (i + 1) / 4) * (1 + wobble()))));
const coast = (from, count, way = 1) => Array.from({ length: count }, (_, i) => way * Math.max(1, Math.round(from * Math.exp(-i / 18))));
const scroll = (speed, count, coasting, way = 1) => [...push(speed, count, way), ...coast(speed, coasting, way)];
const feed = (scrolls, deltas, start = 0) => deltas.map((delta, i) => scrolls.feed(delta, start + i * 16)).filter(Boolean);

test('one scroll moves one stamp, however strong', () => {
  for (const [speed, count, coasting] of [[8, 12, 40], [25, 10, 80], [80, 8, 120], [200, 12, 160], [12, 60, 60]]) {
    seed = 7 + speed;
    assert.deepEqual(feed(wheelScrolls(), scroll(speed, count, coasting)), [1], `speed ${speed}`);
    assert.deepEqual(feed(wheelScrolls(), scroll(speed, count, coasting, -1)), [-1], `speed ${speed} back`);
  }
  assert.deepEqual(feed(wheelScrolls(), [10, 10, 10]), []);
});

test('a scroll thrown into the last one\'s momentum moves again', () => {
  const scrolls = wheelScrolls();
  assert.deepEqual(feed(scrolls, [...scroll(40, 8, 30), ...scroll(40, 8, 80), ...scroll(60, 8, 100, -1)]), [1, 1, -1]);
});

test('a scroll after a pause moves again', () => {
  const scrolls = wheelScrolls();
  assert.deepEqual(feed(scrolls, scroll(80, 8, 30)), [1]);
  assert.deepEqual(feed(scrolls, scroll(20, 8, 30), 2000), [1]);
});

test('once spent, a scroll\'s momentum is let go and the next one counts', () => {
  const scrolls = wheelScrolls();
  const opening = scroll(80, 8, 120);
  feed(scrolls, opening.slice(0, 20));
  scrolls.spend(20 * 16);
  assert.deepEqual(feed(scrolls, [...opening.slice(20), ...scroll(40, 8, 40)], 21 * 16), [1]);
});

test('the sheet lays the stamps out as large as fits, rows centred, inside the room', () => {
  const screen = { width: 1440, height: 900 };
  for (const count of [1, 2, 3, 4, 5, 7]) {
    const { width: w, height: h, cells } = sheetLayout(count, screen);
    assert.equal(cells.length, count);
    for (const { x, y } of cells) {
      assert.ok(x - w / 2 >= -screen.width / 2 + SHEET.side - .5 && x + w / 2 <= screen.width / 2 - SHEET.side + .5, `count ${count} fits across`);
      assert.ok(y - h / 2 >= SHEET.top - screen.height / 2 - .5 && y + h / 2 <= screen.height / 2 - SHEET.bottom + .5, `count ${count} fits down`);
    }
  }
  assert.equal(sheetLayout(3, screen).columns, 3);
  assert.equal(sheetLayout(2, { width: 390, height: 844, side: 16, gap: 16 }).columns, 1);
  // A short last row sits centred.
  const five = sheetLayout(5, screen);
  if (five.columns === 3) assert.ok(Math.abs(five.cells[3].x + five.cells[4].x) < .01);
});

test('stamps set off for the sheet one after another, all there at the end', () => {
  assert.equal(sheetProgress(0, 0, 4), 0);
  assert.equal(sheetProgress(1, 3, 4), 1);
  assert.ok(sheetProgress(.3, 0, 4) > sheetProgress(.3, 3, 4));
});

test('up close, the image fills the room at its own shape, and zoom keeps it covering its frame', () => {
  const room = { width: 1440, height: 900, top: 76, bottom: 40, side: 84 };
  const box = fitRect(4 / 3, room);
  assert.ok(Math.abs(box.width / box.height - 4 / 3) < 1e-9);
  assert.ok(box.top >= room.top && box.top + box.height <= room.height - room.bottom + 1e-9);
  assert.ok(box.left >= room.side - 1e-9);
  const fit = { scale: 1, x: 0, y: 0 };
  const zoomed = zoomAt(fit, { x: 100, y: 50 }, 2, box);
  // The spot under the pointer stays put.
  assert.ok(Math.abs((100 - zoomed.x) / 2 - 100) < 1e-9 && Math.abs((50 - zoomed.y) / 2 - 50) < 1e-9);
  assert.deepEqual(panTo({ scale: 2, x: 50, y: -1e6 }, box), { scale: 2, x: 0, y: -box.height });
  assert.equal(zoomAt(fit, { x: 0, y: 0 }, 99, box).scale, CLOSEUP.most);
  assert.equal(zoomAt(zoomed, { x: 0, y: 0 }, .2, box).scale, 1);
});

test('a stamp keeps its photo\'s own shape, as large as fits the 4:3 box', () => {
  assert.deepEqual(stampSize(4 / 3, 400, 300), { w: 400, h: 300 });
  assert.deepEqual(stampSize(4 / 5, 400, 300), { w: 240, h: 300 });
  assert.deepEqual(stampSize(2, 400, 300), { w: 400, h: 200 });
  assert.deepEqual(stampSize(undefined, 400, 300), { w: 400, h: 300 });
});

test('the stamps paint in the order their depths gave as z-indexes', () => {
  // As 5000 + depth would stack them: by depth, a tie by page order.
  const asZIndex = depths => depths.map((depth, index) => index)
    .sort((a, b) => (5000 + depths[a]) - (5000 + depths[b]) || a - b);
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let round = 0; round < 500; round++) {
    const count = 1 + Math.floor(random() * 12);
    const depths = Array.from({ length: count }, () => Math.round((random() - .8) * 6000 / (random() < .2 ? 1000 : 1)));
    assert.deepEqual(depthOrder(depths), asZIndex(depths));
  }
  assert.deepEqual(depthOrder([0, -640, 360, -640]), [1, 3, 0, 2]);
});
