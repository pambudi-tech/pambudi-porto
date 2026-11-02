import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPTH, galleryPlacement, depthOpacity, galleryCurrent, wheelScrolls, sheetLayout, sheetProgress, SHEET } from './project-gallery.mjs';
import { fitRect, panTo, zoomAt, CLOSEUP } from './project-closeup.mjs';

test('gallery stamps alternate sides and always fit on screen at the camera', () => {
  const room = { width: 1400, height: 900, w: 600, h: 450 };
  for (let index = 0; index < 8; index++) {
    const { x, y } = galleryPlacement(index, room);
    assert.equal(Math.sign(x), index % 2 ? 1 : -1);
    assert.ok(Math.abs(x) + room.w / 2 <= room.width / 2 - DEPTH.side + 1e-9);
    assert.ok(room.height / 2 + y - room.h / 2 >= DEPTH.top - 1e-9);
    assert.ok(room.height / 2 + y + room.h / 2 <= room.height - DEPTH.bottom + 1e-9);
  }
  assert.deepEqual(galleryPlacement(3, room), galleryPlacement(3, room));
});

test('stamps fade in from the fog and out as they pass the camera', () => {
  assert.equal(depthOpacity(0), 1);
  assert.equal(depthOpacity(DEPTH.pass), 0);
  assert.equal(depthOpacity(-DEPTH.spacing * DEPTH.fog), 0);
  assert.ok(depthOpacity(-DEPTH.spacing) > depthOpacity(-DEPTH.spacing * 2));
});

test('the current stamp is the one nearest the camera', () => {
  assert.equal(galleryCurrent(0, 4), 0);
  assert.equal(galleryCurrent(DEPTH.spacing * .6, 4), 1);
  assert.equal(galleryCurrent(DEPTH.spacing * 9, 4), 3);
  assert.equal(galleryCurrent(-DEPTH.spacing, 4), 0);
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
