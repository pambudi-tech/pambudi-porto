import { mountPinPanel } from '../project/project-pin.mjs';

// The resume link under About Me's title. The PDF sits behind the works PIN
// (api/resume.js): a visitor with a pass downloads it at once; anyone else
// gets the protected projects' PIN panel in a popup. A right PIN starts the
// download and the popup folds away; Escape or a tap outside closes it.

const PROMPT = 'enter pin to download the resume';
const LEAVE = 420;

async function holdsPass() {
  try {
    const response = await fetch('/api/pass', { credentials: 'same-origin' });
    return response.ok && (await response.json()).passed === true;
  } catch {
    return false;
  }
}

function download(href, filename) {
  const anchor = Object.assign(document.createElement('a'), { href, download: filename, hidden: true });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function mountResumePin(link) {
  if (!link) return;
  const href = link.getAttribute('href'), filename = link.getAttribute('download');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dialog = null;

  function close() {
    if (!dialog) return;
    const leaving = dialog;
    dialog = null;
    leaving.classList.add('is-closing');
    setTimeout(() => { leaving.close(); leaving.remove(); link.focus({ preventScroll: true }); }, reduced() ? 0 : LEAVE);
  }

  function open() {
    dialog = Object.assign(document.createElement('dialog'), { className: 'pin-modal' });
    dialog.setAttribute('aria-label', 'Enter the PIN to download the resume');
    document.body.append(dialog);
    const pin = mountPinPanel({
      title: 'resume', prompt: PROMPT, parent: dialog,
      onUnlock: () => { download(href, filename); close(); },
    });
    dialog.showModal();
    pin.arrive(0);
    dialog.querySelector('.otp-input')?.focus({ preventScroll: true });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    // A tap on the dimmed page around the panel, not on the panel itself.
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  }

  link.addEventListener('click', async event => {
    event.preventDefault();
    if (dialog) return;
    if (await holdsPass()) download(href, filename);
    else open();
  });
}
