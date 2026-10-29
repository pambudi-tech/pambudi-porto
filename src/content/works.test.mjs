import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKS, EXPLORATION, clockLabel, projectId, projectPage, workHref, yearLabel } from './works.mjs';

test('every work has a unique id, readable months, and a cover with alt text', () => {
  const all = [...WORKS, ...EXPLORATION];
  assert.equal(new Set(all.map(work => work.id)).size, all.length);
  for (const work of all) {
    assert.match(work.from, /^\d{4}-(0[1-9]|1[0-2])$/, work.id);
    if (work.to !== null) assert.ok(work.to >= work.from, work.id);
    assert.ok(work.image && work.alt, work.id);
  }
});

test('year labels and clock messages read the months as years', () => {
  const ocean = WORKS.find(work => work.id === 'ocean');
  assert.equal(yearLabel(ocean), '2024—26');
  assert.equal(clockLabel(ocean), 'OCEAN BY BCA 2024-2026');
  assert.equal(clockLabel(ocean, true), 'OCEAN BY BCA');
  assert.equal(yearLabel({ from: '2025-10', to: null }), '2025—now');
  assert.equal(yearLabel({ from: '2023-05', to: '2023-07' }), '2023');
});

test('project pages live at /work/<id>, and only works with a page get one', () => {
  assert.equal(workHref(WORKS[0]), '/work/ocean');
  assert.equal(workHref(EXPLORATION[0]), null);
  assert.equal(projectId('/work/ocean'), 'ocean');
  assert.equal(projectId('/work/ocean/'), 'ocean');
  assert.equal(projectId('/ocean.html'), null);
  assert.equal(projectPage('soft-forms'), null);
  assert.equal(projectPage('missing'), null);
});

test('a case study keeps its own text; other works borrow its gallery under their own cover', () => {
  const ocean = projectPage('ocean');
  assert.equal(ocean.title, 'Ocean by BCA');
  assert.equal(ocean.images[0].src, WORKS[0].image);
  assert.equal(ocean.images.length, 5);
  const mandalika = projectPage('mandalika');
  const work = WORKS.find(entry => entry.id === 'mandalika');
  assert.equal(mandalika.title, work.title);
  assert.equal(mandalika.subtitle, work.summary);
  assert.equal(mandalika.overview, '');
  assert.equal(mandalika.site, 'https://themandalikagp.com');
  assert.deepEqual(mandalika.facts, { client: work.client, role: work.role, period: '2023', scope: 'website · ui design' });
  assert.deepEqual(mandalika.images[0], { ...ocean.images[0], src: work.image, alt: work.alt });
  assert.deepEqual(mandalika.images.slice(1), ocean.images.slice(1));
});
