import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { mountPinPanel } from '../project/project-pin.mjs';
import { canvasPlan, linkBox, linkLabel, opensTab } from '../resume/resume-layout.mjs';

// pambudi.xyz/resume, opened in its own tab from About Me. The PDF sits
// behind the works PIN (api/resume.js): without a pass, the works PIN panel
// waits over blank sheets; with one, pdf.js draws each page on a white
// sheet, its text selectable and its links live, and the pill below counts
// the pages and downloads the PDF. Only this page loads pdf.js.

const FILE = 'Ivan-Pambudi-Resume.pdf';
const PROMPT = 'enter pin to view the resume';
const LEAVE = 420;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const main = document.querySelector('.resume-sheets');
const bar = document.querySelector('.resume-bar');
const count = bar.querySelector('.resume-count');
const download = bar.querySelector('.resume-download');
let sheets = [...main.querySelectorAll('.resume-sheet')];
let bytes = null;

// pdf.js arrives while the PDF is fetched or the PIN typed.
const pdfjsReady = import('pdfjs-dist').then(pdfjs => {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
});
pdfjsReady.catch(() => {});

// The PDF's bytes, or 'locked' without a pass, or 'error'.
async function fetchResume() {
  try {
    const response = await fetch('/api/resume', { credentials: 'same-origin' });
    if (response.status === 401) return 'locked';
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : 'error';
  } catch {
    return 'error';
  }
}

function save() {
  if (!bytes) return;
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const anchor = Object.assign(document.createElement('a'), { href: url, download: FILE, hidden: true });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
download.addEventListener('click', save);

function ready() {
  main.setAttribute('aria-busy', 'false');
  download.disabled = !bytes;
  document.body.classList.add('is-ready');
}

// A line on the first sheet in place of the pages, with one way on.
function note(text, action) {
  const box = Object.assign(document.createElement('div'), { className: 'resume-note' });
  box.append(Object.assign(document.createElement('p'), { textContent: text }));
  if (action) {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'resume-note-action', textContent: action.label });
    button.addEventListener('click', action.run);
    box.append(button);
  }
  sheets[0].replaceChildren(box);
  ready();
}
const failed = () => note('couldn’t load the resume', { label: 'try again', run: () => location.reload() });
const unsupported = () => note('this browser can’t show the resume here', { label: 'download the pdf', run: save });

// One sheet per page, each the page's own shape.
function fitSheets(pages) {
  while (sheets.length < pages.length) {
    const sheet = Object.assign(document.createElement('article'), { className: 'resume-sheet' });
    main.append(sheet);
    sheets.push(sheet);
  }
  sheets.splice(pages.length).forEach(sheet => sheet.remove());
  pages.forEach((page, index) => {
    const [x0, y0, x1, y1] = page.view;
    sheets[index].style.aspectRatio = `${x1 - x0} / ${y1 - y0}`;
    sheets[index].setAttribute('aria-label', `Page ${index + 1} of ${pages.length}`);
  });
}

// The canvas at the sheet's width, redrawn only when its size changes.
const drawn = new WeakMap();
async function paint(page, sheet) {
  const plan = canvasPlan(sheet.clientWidth, page.view, devicePixelRatio || 1);
  sheet.style.setProperty('--total-scale-factor', plan.scale);
  const state = drawn.get(sheet);
  if (!state || state.width === plan.width) return;
  state.task?.cancel();
  const viewport = page.getViewport({ scale: plan.scale * plan.ratio });
  // Drawn off to the side, then swapped in, so a resize never shows a blank page.
  const canvas = Object.assign(document.createElement('canvas'), { className: 'resume-canvas', width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
  canvas.setAttribute('aria-hidden', 'true');
  state.width = plan.width;
  state.task = page.render({ canvas, viewport });
  try {
    await state.task.promise;
  } catch (error) {
    if (error?.name === 'RenderingCancelledException') return;
    throw error;
  }
  state.canvas ? state.canvas.replaceWith(canvas) : sheet.prepend(canvas);
  state.canvas = canvas;
  sheet.classList.add('is-drawn');
}

async function drawPage(pdfjs, page, sheet) {
  drawn.set(sheet, { width: 0 });
  sheet.replaceChildren();
  await paint(page, sheet);
  const [x0, , x1] = page.view;
  const text = Object.assign(document.createElement('div'), { className: 'textLayer' });
  const links = Object.assign(document.createElement('div'), { className: 'resume-links' });
  sheet.append(text, links);
  const viewport = page.getViewport({ scale: sheet.clientWidth / (x1 - x0) });
  await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport }).render();
  for (const annotation of await page.getAnnotations()) {
    if (annotation.subtype !== 'Link' || !annotation.url) continue;
    const link = Object.assign(document.createElement('a'), { href: annotation.url });
    link.setAttribute('aria-label', linkLabel(annotation.url));
    if (opensTab(annotation.url)) Object.assign(link, { target: '_blank', rel: 'noopener noreferrer' });
    Object.assign(link.style, linkBox(annotation.rect, page.view));
    links.append(link);
  }
}

// The pill's count follows the page most in view.
function countPages(total) {
  const seen = new Map();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) seen.set(entry.target, entry.intersectionRatio);
    let best = 0;
    sheets.forEach((sheet, index) => { if ((seen.get(sheet) ?? 0) > (seen.get(sheets[best]) ?? 0)) best = index; });
    count.textContent = `${best + 1} / ${total}`;
  }, { threshold: [0, .25, .5, .75, 1] });
  sheets.forEach(sheet => observer.observe(sheet));
  count.textContent = `1 / ${total}`;
}

async function show(data) {
  bytes = data;
  let pdfjs;
  try {
    pdfjs = await pdfjsReady;
  } catch {
    return unsupported();
  }
  try {
    // pdf.js takes over the buffer it is given; the download keeps its own.
    const doc = await pdfjs.getDocument({ data: data.slice(), useWasm: false, isEvalSupported: false }).promise;
    const pages = await Promise.all(Array.from({ length: doc.numPages }, (_, index) => doc.getPage(index + 1)));
    fitSheets(pages);
    await Promise.all(pages.map((page, index) => drawPage(pdfjs, page, sheets[index])));
    countPages(pages.length);
    let timer;
    new ResizeObserver(() => {
      // The text and links follow the width at once; the canvas, a moment later.
      pages.forEach((page, index) => {
        const [x0, , x1] = page.view;
        sheets[index].style.setProperty('--total-scale-factor', sheets[index].clientWidth / (x1 - x0));
      });
      clearTimeout(timer);
      timer = setTimeout(() => pages.forEach((page, index) => paint(page, sheets[index]).catch(() => {})), 180);
    }).observe(main);
    ready();
  } catch (error) {
    console.warn('Resume could not be drawn:', error);
    unsupported();
  }
}

// Without a pass: the works PIN panel over the blank sheets, which stay
// out of reach until the right PIN.
function askPin() {
  const lock = Object.assign(document.createElement('div'), { className: 'pin-overlay' });
  lock.setAttribute('role', 'dialog');
  lock.setAttribute('aria-modal', 'true');
  lock.setAttribute('aria-label', 'Enter the PIN to view the resume');
  main.inert = bar.inert = true;
  document.body.append(lock);
  const pin = mountPinPanel({
    title: 'resume', prompt: PROMPT, parent: lock,
    // The pages are drawn while "unlocked for a day" shows, and the veil
    // lifts onto them finished.
    onUnlock: async () => {
      const data = await fetchResume();
      if (data instanceof Uint8Array) await show(data);
      else failed();
      main.inert = bar.inert = false;
      lock.classList.add('is-closing');
      setTimeout(() => lock.remove(), reduced() ? 0 : LEAVE);
    },
  });
  pin.arrive(0);
  lock.querySelector('.otp-input')?.focus({ preventScroll: true });
}

// Asked first, as the works row asks, so a locked visit makes no failed request.
async function holdsPass() {
  try {
    const response = await fetch('/api/pass', { credentials: 'same-origin' });
    return response.ok ? (await response.json()).passed === true : null;
  } catch {
    return null;
  }
}

const first = await holdsPass() === false ? 'locked' : await fetchResume();
if (first === 'locked') askPin();
else if (first === 'error') failed();
else await show(first);
