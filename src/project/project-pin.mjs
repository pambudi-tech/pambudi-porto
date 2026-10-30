import { SITE } from '../../content/site.mjs';
import { unlock } from './project-pass.mjs';
import { createOtpField } from './otp-field.mjs';
import { ProjectStitches } from './project-stitches.mjs';
import { cornerPitch } from '../stitch/corners.mjs';
import { GRID } from '../stitch/model.mjs';
import { hash } from '../stitch/render.mjs';

const DIGITS = 6;
const PROMPT = 'enter pin to see the project';
const STITCHES = 5;
// How long a right PIN stays on show, in ms, before the panel leaves.
const SUCCESS_HOLD = 1100;

// A row of red cross-stitches across the top of the panel, the cover frame's
// size and thread, straddling its edge. They sew in, left to right, with
// `reveal`.
function mountPanelStitches(panel) {
  const canvas = Object.assign(document.createElement('canvas'), { className: 'project-pin-stitches' });
  canvas.setAttribute('aria-hidden', 'true');
  panel.append(canvas);
  const stitches = new ProjectStitches(canvas, { sweep: 360 });
  let previous;
  const layout = () => {
    const pitch = cornerPitch(innerWidth), scale = pitch / GRID, dpr = Math.min(devicePixelRatio || 1, 2);
    const key = `${pitch}:${dpr}`;
    if (previous === key) return;
    previous = key;
    // The thread reaches past its cell; the canvas leaves room for it.
    const pad = Math.ceil(5 * scale) + 1;
    const width = STITCHES * pitch + pad * 2, height = pitch + pad * 2;
    Object.assign(canvas.style, { width: `${width}px`, height: `${height}px`, marginLeft: `${-width / 2}px`, top: `${-height / 2}px` });
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    const cells = Array.from({ length: STITCHES }, (_, index) => ({
      key: `pin:${index}`, variation: Math.floor(hash(index, 0) * 8), x: pad + index * pitch, y: pad,
    }));
    stitches.layout(cells, [cells.map(cell => cell.key)], dpr, scale);
  };
  layout();
  addEventListener('resize', layout, { passive: true });
  return stitches;
}

// The panel a protected project shows in place of its gallery seal: a
// six-digit field in two threes (otp-field.mjs), checked as the sixth digit
// lands. Below the panel, on one line, where to ask for the PIN. It waits
// unseen until `arrive`. `onUnlock` runs once the PIN is right; then both
// fold away.
export function mountPinPanel({ title, onUnlock }) {
  const root = Object.assign(document.createElement('div'), { className: 'project-pin is-waiting' });
  const panel = Object.assign(document.createElement('form'), { className: 'project-pin-panel', noValidate: true });
  panel.innerHTML = `<p class="project-pin-message" id="project-pin-message" role="status">${PROMPT}</p>`;
  const subject = encodeURIComponent(`PIN request: ${title}`);
  const ask = Object.assign(document.createElement('p'), { className: 'project-pin-ask' });
  ask.innerHTML = `no pin? ask me at <a href="mailto:${SITE.email}?subject=${subject}">${SITE.email}</a>`
    + '<button class="project-pin-copy" type="button">copy</button>';
  root.append(panel, ask);
  const stitches = mountPanelStitches(panel);
  const message = panel.querySelector('.project-pin-message');
  const copy = ask.querySelector('.project-pin-copy');
  const field = createOtpField({
    length: DIGITS, groups: [3, 3], label: `${DIGITS}-digit pin`, describedBy: 'project-pin-message',
    onComplete: () => check(),
  });
  message.before(field.element);
  let checking = false;

  const say = (text, tone = '') => {
    message.textContent = text;
    message.dataset.tone = tone;
  };

  async function check() {
    if (checking || field.value.length !== DIGITS) return;
    checking = true;
    field.busy = true;
    say('checking…');
    const result = await unlock(field.value);
    field.busy = false;
    checking = false;
    if (result === 'ok') {
      // The right PIN stays a moment, its digits settled, before the panel
      // gives way to the gallery seal.
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      say('unlocked for a day', 'ok');
      field.input.blur();
      field.input.readOnly = true;
      panel.classList.add('is-unlocked');
      await new Promise(resolve => setTimeout(resolve, reduced ? 0 : SUCCESS_HOLD));
      root.classList.add('is-leaving');
      await onUnlock();
      setTimeout(() => root.remove(), reduced ? 0 : 420);
      return;
    }
    say(result === 'wrong' ? 'that’s not it' : 'couldn’t check it, try again', 'error');
    if (result === 'wrong') {
      panel.animate([0, -8, 7, -5, 3, 0].map(x => ({ translate: `${x}px 0` })), { duration: 360, easing: 'ease-out' });
      field.clear();
    }
  }

  field.input.addEventListener('input', () => {
    if (field.value.length < DIGITS && message.dataset.tone === 'error') say(PROMPT);
  });
  panel.addEventListener('submit', event => { event.preventDefault(); check(); });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(SITE.email);
      copy.textContent = 'copied';
    } catch {
      copy.textContent = 'copy failed';
    }
    setTimeout(() => { copy.textContent = 'copy'; }, 1600);
  });
  document.body.append(root);
  return {
    element: root,
    // Shows it after `delay` ms, at once for reduced motion, and sews its
    // stitches on.
    arrive(delay = 0) {
      setTimeout(() => {
        root.classList.remove('is-waiting');
        stitches.reveal();
      }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : delay);
    },
  };
}
