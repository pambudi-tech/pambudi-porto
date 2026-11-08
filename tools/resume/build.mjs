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

const print = (html, pdf) => execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(html).href], { stdio: 'ignore' });

print(source, resume);
console.log(`wrote ${resume}`);

const scratch = mkdtempSync(join(tmpdir(), 'resume-locked-'));
try {
  const teaserHtml = join(scratch, 'teaser.html'), teaserPdf = join(scratch, 'teaser.pdf');
  writeFileSync(teaserHtml, scrambleResume(readFileSync(source, 'utf8')));
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
