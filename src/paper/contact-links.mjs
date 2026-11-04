import { EASE_OUT } from '../shared/motion.mjs';

// A tooltip's new words come through a brief blur rather than jumping in,
// so the old and new read as one label changing.
export function blurSwap(element, { reduced = false } = {}) {
  if (reduced) return;
  try {
    element.animate([{ filter: 'blur(2px)', opacity: .6 }, { filter: 'blur(0)', opacity: 1 }],
      { duration: 180, easing: EASE_OUT, pseudoElement: '::after' });
  } catch { /* No pseudo-element animation here: the words simply change. */ }
}

export function setupEmailCopy(button, {
  clipboard = globalThis.navigator?.clipboard,
  announce = () => {},
  motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),
} = {}) {
  if (!button) return;
  const tooltip = button.dataset.tooltip;
  const swap = words => {
    button.dataset.tooltip = words;
    blurSwap(button, { reduced: motionPreference?.matches });
  };
  let reset;
  button.addEventListener('click', async () => {
    clearTimeout(reset);
    try {
      await clipboard.writeText(button.dataset.email);
      swap('copied!');
      announce('Email address copied to clipboard.');
    } catch {
      swap('couldn’t copy');
      announce(`Could not copy the email address: ${button.dataset.email}`);
    }
    button.dataset.feedback = 'true';
    reset = setTimeout(() => {
      delete button.dataset.feedback;
      // Still showing, its words change back in place; otherwise only once
      // it has faded, so the fade never shows them changing.
      if (button.matches(':hover, :focus-visible')) swap(tooltip);
      else reset = setTimeout(() => { button.dataset.tooltip = tooltip; }, 200);
    }, 2000);
  });
}
