import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const imports = css => [...css.matchAll(/@import "\.\.\/([\w-]+)\.css";/g)].map(match => match[1]);

test('each page links one stylesheet, so the build cannot regroup the cascade', () => {
  for (const [page, sheet] of [['index.html', 'home'], ['work.html', 'work'], ['surface.html', 'surface']]) {
    const links = [...read(page).matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(\/src\/[^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(links, [`/src/styles/pages/${sheet}.css`], page);
  }
});

test('page styles import the base first and the postage stamp before what restacks it', () => {
  const home = imports(read('src/styles/pages/home.css'));
  assert.deepEqual(home, ['base', 'postage-stamp', 'works', 'project-transition']);
  const work = imports(read('src/styles/pages/work.css'));
  assert.equal(work[0], 'base');
  assert.ok(work.indexOf('postage-stamp') < work.indexOf('project-detail'));
  assert.deepEqual(imports(read('src/styles/pages/surface.css')), ['base', 'surface-only']);
});
