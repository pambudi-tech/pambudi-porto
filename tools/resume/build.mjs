// Prints tools/resume/resume.html with headless Chrome, so the PDF keeps real,
// selectable text for ATS parsers, into private/resume/ivan-pambudi-resume.pdf,
// served only to PIN pass holders by api/resume.js.
//
// Then the public pages shown, blurred, before the PIN: the teaser
// (scramble.mjs: every word below the header scrambled) is printed the same
// way and each page drawn with pdf.js (@napi-rs/canvas comes with
// pdfjs-dist) into public/assets/resume/teaser-<page>.webp. Nothing in it is
// private; the teaser PDF itself is not kept.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { scrambleResume } from './scramble.mjs';

const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const here = path => fileURLToPath(new URL(path, import.meta.url));
const source = here('./resume.html');
const resume = here('../../private/resume/ivan-pambudi-resume.pdf');
const teaserDir = here('../../public/assets/resume/');
// The teaser pages' width: plenty under the blur they are shown with.
const WIDTH = 480;

// The budget lets the page's web fonts load before it is printed.
const print = (html, pdf) => execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=10000', `--print-to-pdf=${pdf}`, pathToFileURL(html).href], { stdio: 'ignore' });

// The works PIN, printed beside the site link so a reader can open the works.
// It comes from the environment (WORKS_PIN, as in .env.local) so the HTML
// source never holds it; the public teaser gets made-up digits in its place.
const pin = process.env.WORKS_PIN;
if (!/^\d+$/.test(pin ?? '')) throw new Error('Set WORKS_PIN to the works PIN (digits) before building.');
const html = readFileSync(source, 'utf8');
if (!html.includes('{{WORKS_PIN}}')) throw new Error('resume.html has no {{WORKS_PIN}} spot.');

const scratch = mkdtempSync(join(tmpdir(), 'resume-locked-'));
try {
  const resumeHtml = join(scratch, 'resume.html');
  writeFileSync(resumeHtml, html.replaceAll('{{WORKS_PIN}}', pin));
  print(resumeHtml, resume);
  console.log(`wrote ${resume}`);

  // Fixed digits, not derived from the PIN, so the teaser says nothing about it.
  const fakePin = '4729105836'.slice(0, pin.length).padEnd(pin.length, '0');
  const teaserHtml = join(scratch, 'teaser.html'), teaserPdf = join(scratch, 'teaser.pdf');
  writeFileSync(teaserHtml, scrambleResume(html.replaceAll('{{WORKS_PIN}}', fakePin)));
  print(teaserHtml, teaserPdf);
  const task = getDocument({ data: new Uint8Array(readFileSync(teaserPdf)), useWasm: false, isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  mkdirSync(teaserDir, { recursive: true });
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: WIDTH / page.getViewport({ scale: 1 }).width });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const out = join(teaserDir, `teaser-${number}.webp`);
    writeFileSync(out, await canvas.encode('webp', 72));
    console.log(`wrote ${out}`);
  }
  await task.destroy();
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
