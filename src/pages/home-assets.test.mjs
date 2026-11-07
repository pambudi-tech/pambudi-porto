import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { EXPLORATION } from '../../content/works.mjs';
import { versionAssets } from '../../build/asset-versions.mjs';

const publicDir = new URL('../../public/', import.meta.url);

// The homepage's images are cached for a year once a build versions them
// (build/asset-versions.mjs), which it can only do for a path named in full.
test("exploration's images are named in full, so a build versions every one", () => {
  const source = readFileSync(new URL('../../content/works.mjs', import.meta.url), 'utf8');
  const built = versionAssets(source, publicDir);
  for (const work of EXPLORATION) {
    assert.equal(work.image, `/assets/exploration/${work.id}.webp`);
    assert.equal(work.preview, `/assets/exploration/preview/${work.id}.webp`);
    for (const url of [work.image, work.preview]) {
      assert.ok(existsSync(new URL(`.${url}`, publicDir)), url);
      assert.match(built, new RegExp(`'${url.replaceAll('.', '\\.')}\\?v=[0-9a-f]{10}'`), url);
    }
  }
});
