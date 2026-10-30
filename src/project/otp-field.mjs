// A one-time-code field that behaves like input-otp (input-otp.rodz.dev),
// without React: one real, invisible input stretched over the slots takes
// all the typing, pasting, autofill and selection, and the slots only show
// it. A click lands on the slot under it; a filled slot is selected whole, so
// typing replaces it; the slot being typed into shows a blinking caret.

export function createOtpField({ length = 6, groups = [3, 3], label, describedBy, onComplete }) {
  const root = Object.assign(document.createElement('div'), { className: 'otp' });
  const input = Object.assign(document.createElement('input'), {
    className: 'otp-input', type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code',
    maxLength: length, spellcheck: false,
  });
  input.pattern = '[0-9]*';
  input.setAttribute('aria-label', label);
  if (describedBy) input.setAttribute('aria-describedby', describedBy);
  const slots = [];
  groups.forEach((size, group) => {
    if (group) root.append(Object.assign(document.createElement('span'), { className: 'otp-separator', textContent: '·' }));
    const set = Object.assign(document.createElement('span'), { className: 'otp-group' });
    for (let index = 0; index < size; index++) {
      const slot = Object.assign(document.createElement('span'), { className: 'otp-slot' });
      slot.innerHTML = '<span class="otp-char"></span><span class="otp-caret"></span>';
      set.append(slot);
      slots.push(slot);
    }
    root.append(set);
  });
  root.setAttribute('aria-hidden', 'false');
  for (const set of root.querySelectorAll('.otp-group, .otp-separator')) set.setAttribute('aria-hidden', 'true');
  root.append(input);

  // The selection the slots show, and the one before it, to tell which way
  // an arrow key went.
  let start = null, end = null, previous = [null, null];

  function render() {
    const focused = document.activeElement === input;
    slots.forEach((slot, index) => {
      const char = input.value[index];
      const active = focused && start !== null && end !== null
        && ((start === end && index === start) || (index >= start && index < end));
      slot.querySelector('.otp-char').textContent = char ?? '';
      slot.classList.toggle('is-active', active);
      slot.classList.toggle('is-filled', Boolean(char));
      slot.classList.toggle('has-caret', active && !char);
    });
  }

  // As input-otp does: a lone caret among the typed digits selects the digit
  // beside it, so the active slot is always one slot and typing replaces it.
  function sync() {
    if (!input.isConnected) return;
    if (document.activeElement !== input) { start = end = null; render(); return; }
    const { selectionStart: from, selectionEnd: to } = input;
    const value = input.value;
    let first = -1, last = -1, direction;
    if (value.length && from !== null && to !== null && from === to && !(from === value.length && value.length < length)) {
      if (from === 0) [first, last, direction] = [0, 1, 'forward'];
      else if (from === length) [first, last, direction] = [from - 1, from, 'backward'];
      else if (value.length > 1) {
        let offset = 0;
        if (previous[0] !== null && previous[1] !== null) {
          direction = from < previous[1] ? 'backward' : 'forward';
          const inserting = previous[0] === previous[1] && previous[0] < length;
          if (direction === 'backward' && !inserting) offset = -1;
        }
        [first, last] = [offset + from, offset + from + 1];
      }
      if (first !== -1 && first !== last) input.setSelectionRange(first, last, direction);
    }
    start = first !== -1 ? first : from;
    end = last !== -1 ? last : to;
    previous = [start, end];
    render();
  }

  function accept(value, caret = value.length) {
    input.value = value.replace(/\D/g, '').slice(0, length);
    const at = Math.min(caret, input.value.length);
    input.setSelectionRange(at, at);
    sync();
    if (input.value.length === length) onComplete?.(input.value);
  }

  input.addEventListener('input', () => accept(input.value, input.selectionStart ?? input.value.length));
  input.addEventListener('paste', event => {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text/plain') ?? '').replace(/\D/g, '');
    const { selectionStart: from = 0, selectionEnd: to = 0 } = input;
    const value = input.value.slice(0, from) + pasted + input.value.slice(to);
    accept(value, from + pasted.length);
  });
  input.addEventListener('focus', () => {
    const from = Math.min(input.value.length, length - 1);
    input.setSelectionRange(from, input.value.length);
    start = from;
    end = input.value.length;
    render();
  });
  input.addEventListener('blur', sync);
  // Browsers report a text field's selection changes on the field or on the
  // document; keys and clicks catch any that report neither.
  for (const type of ['selectionchange', 'keyup', 'pointerup']) input.addEventListener(type, sync);
  document.addEventListener('selectionchange', sync);
  render();

  return {
    element: root, input,
    get value() { return input.value; },
    clear() { input.value = ''; previous = [null, null]; sync(); },
    set busy(on) { input.readOnly = on; root.classList.toggle('is-busy', on); },
  };
}
