import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scrambleResume } from '../../tools/resume/scramble.mjs';

const source = readFileSync(new URL('../../tools/resume/resume.html', import.meta.url), 'utf8');
const teaser = scrambleResume(source);
const words = html => html.replace(/<[^>]*>|&#?\w+;/g, ' ').match(/[A-Za-z]{4,}/g) ?? [];
const body = html => html.slice(html.indexOf('<h2>Professional Summary</h2>'));

test('the teaser keeps the header and the section headings', () => {
  for (const kept of ['Ivan Pambudi', 'UI Designer | Product Designer', '+62 878-4000-9811', 'ivan@pambudi.xyz',
    'linkedin.com/in/pambudixix', '<h2>Professional Summary</h2>', '<h2>Work Experience</h2>', '<h2>Education</h2>']) {
    assert.ok(teaser.includes(kept), kept);
  }
});

test('nothing below the header survives the scrambling', () => {
  const headings = new Set(['Professional', 'Summary', 'Skills', 'Work', 'Experience', 'Education', 'Languages']);
  const original = new Set(words(body(source)).filter(word => !headings.has(word)));
  const leaked = words(body(teaser)).filter(word => original.has(word) && !headings.has(word));
  assert.deepEqual(leaked, []);
  for (const secret of ['Natuno', 'glassmorphism', 'Billionaire', 'Padepokan', 'Politeknik', 'Prioritas', 'Flutter']) {
    assert.ok(!body(teaser).includes(secret), secret);
  }
});

test('the scrambling keeps the shape: same tags, same lengths, same each build', () => {
  assert.equal(teaser.length, source.length);
  assert.equal(teaser.replace(/>[^<]*</g, '><'), source.replace(/>[^<]*</g, '><'));
  assert.equal(scrambleResume(source), teaser);
});
