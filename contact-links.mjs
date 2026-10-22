export function setupEmailCopy(button, {
  clipboard = globalThis.navigator?.clipboard,
  announce = () => {},
} = {}) {
  if (!button) return;
  const tooltip = button.dataset.tooltip;
  let reset;
  button.addEventListener('click', async () => {
    clearTimeout(reset);
    try {
      await clipboard.writeText(button.dataset.email);
      button.dataset.tooltip = 'copied!';
      announce('Email address copied to clipboard.');
    } catch {
      button.dataset.tooltip = 'couldn’t copy';
      announce(`Could not copy the email address: ${button.dataset.email}`);
    }
    button.dataset.feedback = 'true';
    reset = setTimeout(() => {
      button.dataset.tooltip = tooltip;
      delete button.dataset.feedback;
    }, 2000);
  });
}
