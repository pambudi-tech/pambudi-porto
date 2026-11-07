import { WORKS, workHref, yearLabel } from '../content/works.mjs';
import { EASE_OUT } from '../shared/motion.mjs';

// The top bar's pill names the project, and opens a list of every project
// to move to. The works row's own pill, as it morphs into this one, is drawn
// from the same parts, so the two meet at one size.
// The list opens in `open` ms; its rows follow it in, `lead` ms behind and
// `stagger` ms apart, each taking `row` ms, and however many there are, the
// last has settled `within` ms of the click.
export const SWITCH = Object.freeze({ open: 260, close: 180, row: 180, lead: 30, stagger: 16, within: 290 });

// When the `index`th of `count` rows starts to come in.
export function rowDelay(index, count, { lead, stagger, row, within } = SWITCH) {
  const gap = count > 1 ? Math.min(stagger, (within - lead - row) / (count - 1)) : 0;
  return lead + index * Math.max(0, gap);
}

export const switchWorks = () => WORKS.filter(work => workHref(work));

// The pill's parts: a button on the project page, plain spans in the morph.
export function fillSwitch(pill, { title }, { interactive = true } = {}) {
  const name = Object.assign(document.createElement(interactive ? 'button' : 'span'), { className: 'project-switch-name' });
  if (interactive) name.type = 'button';
  const label = Object.assign(document.createElement('span'), { className: 'project-switch-title', textContent: title });
  const caret = Object.assign(document.createElement('span'), { className: 'project-switch-caret' });
  caret.setAttribute('aria-hidden', 'true');
  name.append(label, caret);
  pill.replaceChildren(name);
  return { name };
}

// `go(id)` moves to another project, `prepare(id, { now })` readies it ahead
// of a likely choice: after a lingering hover, or `now` for a touch.
export function mountProjectSwitch(pill, { id, title, go, prepare, motionPreference }) {
  const works = switchWorks();
  const { name } = fillSwitch(pill, { title });
  const time = length => motionPreference.matches ? 0 : length;
  name.setAttribute('aria-haspopup', 'true');
  name.setAttribute('aria-expanded', 'false');
  name.setAttribute('aria-label', `${title}: choose a project`);

  let moving = false;
  const choose = work => {
    if (moving || !work || work.id === id) return;
    moving = true;
    pill.classList.add('is-moving');
    close({ quick: true });
    go(work.id);
  };

  // The list unfolds from under the pill: each project's stamp, its name and
  // years, the one open marked, protected ones tagged.
  const list = Object.assign(document.createElement('div'), { className: 'project-switch-list', hidden: true, id: 'project-switch-list' });
  list.setAttribute('role', 'menu');
  list.setAttribute('aria-label', 'Projects');
  name.setAttribute('aria-controls', list.id);
  const items = works.map(work => {
    const item = Object.assign(document.createElement('button'), { type: 'button', className: 'project-switch-item' });
    item.setAttribute('role', 'menuitem');
    if (work.id === id) item.setAttribute('aria-current', 'page');
    const stamp = Object.assign(document.createElement('span'), { className: 'project-switch-stamp' });
    stamp.append(Object.assign(new Image(), { src: work.image, alt: '', decoding: 'async', loading: 'lazy' }));
    const text = Object.assign(document.createElement('span'), { className: 'project-switch-text' });
    text.append(
      Object.assign(document.createElement('span'), { className: 'project-switch-work', textContent: work.title }),
      Object.assign(document.createElement('span'), { className: 'project-switch-years', textContent: work.passwordProtected ? `${yearLabel(work)} · passcode` : yearLabel(work) }),
    );
    item.append(stamp, text);
    item.addEventListener('click', () => choose(work));
    item.addEventListener('pointerenter', () => work.id !== id && prepare(work.id));
    // A finger has no hover: it readies the project as it touches down.
    item.addEventListener('pointerdown', () => work.id !== id && prepare(work.id, { now: true }));
    item.addEventListener('focus', () => work.id !== id && prepare(work.id));
    list.append(item);
    return item;
  });
  document.body.append(list);

  let shown = false, animation = null;
  // Hung from the pill's middle, kept on screen.
  const place = () => {
    const box = pill.getBoundingClientRect(), width = list.offsetWidth;
    list.style.top = `${box.bottom + 8}px`;
    const left = Math.max(12, Math.min(innerWidth - width - 12, box.left + box.width / 2 - width / 2));
    list.style.left = `${left}px`;
    // It grows from under the pill, even when kept from the screen's edge.
    list.style.transformOrigin = `${(box.left + box.width / 2 - left).toFixed(1)}px 0`;
  };
  function open() {
    if (shown || moving || document.body.classList.contains('gallery-open')) return;
    shown = true;
    holding(true);
    list.hidden = false;
    place();
    name.setAttribute('aria-expanded', 'true');
    pill.classList.add('is-open');
    animation?.cancel();
    animation = list.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: time(SWITCH.open), easing: EASE_OUT });
    items.forEach((item, index) => item.animate([{ opacity: 0, translate: '0 -4px' }, { opacity: 1, translate: '0 0' }], {
      duration: time(SWITCH.row), delay: time(rowDelay(index, items.length)), easing: EASE_OUT, fill: 'backwards',
    }));
    (items.find(item => item.hasAttribute('aria-current')) ?? items[0]).focus({ preventScroll: true });
  }
  function close({ quick = false, refocus = false } = {}) {
    if (!shown) return;
    shown = false;
    holding(false);
    name.setAttribute('aria-expanded', 'false');
    pill.classList.remove('is-open');
    animation?.cancel();
    animation = list.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px) scale(.98)' }], { duration: time(quick ? 120 : SWITCH.close), easing: EASE_OUT, fill: 'forwards' });
    animation.finished.then(() => { if (!shown) list.hidden = true; }, () => {});
    if (refocus) name.focus({ preventScroll: true });
  }
  name.addEventListener('click', () => (shown ? close() : open()));
  // While the list is open the page holds still, and the wheel never reaches
  // the gallery beneath; only the list itself scrolls, if it must. Listened
  // for only while it is open: a listener that may hold the wheel or a
  // finger makes every scroll wait on the page's script first.
  const hold = event => {
    if (!shown) return;
    event.stopPropagation();
    if (!list.contains(event.target) || list.scrollHeight <= list.clientHeight) event.preventDefault();
  };
  function holding(on) {
    for (const type of ['wheel', 'touchmove']) {
      if (on) addEventListener(type, hold, { capture: true, passive: false });
      else removeEventListener(type, hold, { capture: true });
    }
  }
  addEventListener('pointerdown', event => {
    if (shown && !list.contains(event.target) && !name.contains(event.target)) close();
  }, true);
  list.addEventListener('keydown', event => {
    const index = items.indexOf(document.activeElement);
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (move) items[(index + move + items.length) % items.length].focus();
    else if (event.key === 'Home') items[0].focus();
    else if (event.key === 'End') items[items.length - 1].focus();
    else if (event.key === 'Escape') close({ refocus: true });
    else if (event.key === 'Tab') close();
    else return;
    if (event.key !== 'Tab') { event.preventDefault(); event.stopPropagation(); }
  });
  addEventListener('resize', () => { if (shown) place(); });
  // Back to rest, if the move to another project fell through.
  const settle = () => { moving = false; pill.classList.remove('is-moving'); };
  return { close, settle, isOpen: () => shown };
}
