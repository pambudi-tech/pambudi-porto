const SVG = 'http://www.w3.org/2000/svg';
export const INK_HOVER = Object.freeze({ reach: 90, fadeMs: 150, followMs: 85 });

export function inkProximity(bounds, x, y) {
  if (!bounds.width || !bounds.height) return 0;
  const distance = Math.hypot(Math.max(bounds.left - x, 0, x - bounds.right),
    Math.max(bounds.top - y, 0, y - bounds.bottom));
  const amount = Math.max(0, 1 - distance / INK_HOVER.reach);
  return amount * amount * (3 - 2 * amount);
}

export function advanceInk(current, target, elapsed) {
  const dt = Math.max(0, Math.min(elapsed, 50));
  return Object.fromEntries(Object.keys(target).map(key => {
    const duration = key === 'strength' ? INK_HOVER.fadeMs : INK_HOVER.followMs;
    const value = current[key] + (target[key] - current[key]) * (1 - Math.exp(-dt / duration));
    return [key, Math.abs(value - target[key]) < .001 ? target[key] : value];
  }));
}

function hasRuntLastLine(source) {
  // Measure native words so the rule also works with reduced motion, when
  // the decorative ink layer is hidden. Keep only the last two words.
  const words = [];
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    for (const match of node.textContent.matchAll(/\S+/g)) {
      words.push({ node, start: match.index, end: match.index + match[0].length });
      if (words.length > 2) words.shift();
    }
  }
  if (!words.length) return false;
  if (words.length === 1) return true;
  const tops = words.map(word => {
    const range = document.createRange();
    range.setStart(word.node, word.start);
    range.setEnd(word.node, word.end);
    return range.getBoundingClientRect().top;
  });
  return Math.abs(tops[1] - tops[0]) > parseFloat(getComputedStyle(source).lineHeight) / 2;
}

export class IntroInkHover {
  constructor(copy, motionPreference) {
    this.copy = copy;
    this.motionPreference = motionPreference;
    this.layers = [];
    this.measurements = [];
    this.entries = [];
    this.selecting = false;
    this.frame = null;
    this.lastTime = null;
    // Prepare the visible lettering and pointer response before the loader exits.
    this.prepare();
    const paper = copy.closest('.portfolio-paper');
    paper?.addEventListener('paperflipstart', () => this.setSuspended(true));
    paper?.addEventListener('paperflipend', event => this.setSuspended(event.detail.red));
    motionPreference.addEventListener('change', () => this.clear());
    const syncSelection = () => {
      const selection = document.getSelection();
      const selected = selection && !selection.isCollapsed
        && (copy.contains(selection.anchorNode) || copy.contains(selection.focusNode));
      copy.classList.toggle('ink-selecting', this.selecting || Boolean(selected));
      if (this.selecting || selected) {
        // Hold the last painted ink while the native, transparent source
        // handles selection. Copying never needs a plain-text visual swap.
        cancelAnimationFrame(this.frame);
        this.frame = null;
        this.lastTime = null;
        for (const entry of this.entries) entry.target = { ...entry.current };
      }
    };
    copy.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.selecting = true;
      syncSelection();
    });
    document.addEventListener('pointerup', () => { this.selecting = false; syncSelection(); });
    document.addEventListener('selectionchange', syncSelection);
    window.addEventListener('blur', () => {
      this.selecting = false;
      syncSelection();
      if (!copy.classList.contains('ink-selecting')) this.clear();
    });
    window.addEventListener('resize', () => {
      this.clear();
      for (const measure of this.measurements) measure();
    });
    copy.addEventListener('paper-contour-layout', () => {
      for (const measure of this.measurements) measure();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !copy.classList.contains('ink-selecting')) this.clear();
    });
    // Track the actual pointer even while the paper owns pointer capture.
    document.addEventListener('pointermove', event => {
      if (this.suspended) return;
      if (event.pointerType === 'touch' || motionPreference.matches) { this.clear(); return; }
      if (copy.classList.contains('ink-selecting')) return;
      if (event.target.closest?.('#stitch-controls')) { this.clear(); return; }
      for (const entry of this.entries) {
        const bounds = entry.paragraph.getBoundingClientRect();
        const strength = inkProximity(bounds, event.clientX, event.clientY);
        if (!strength) { entry.target.strength = 0; continue; }
        const x = (event.clientX - bounds.left) / bounds.width * entry.paragraph.offsetWidth + 8;
        const y = (event.clientY - bounds.top) / bounds.height * entry.paragraph.offsetHeight + 8;
        entry.target = { x, y, strength };
        // Start at the approaching pointer rather than pulling in from (0, 0).
        if (!entry.current.strength) entry.current = { x, y, strength: 0 };
      }
      this.requestDraw();
    });
    document.addEventListener('pointerout', event => {
      if (!event.relatedTarget && !copy.classList.contains('ink-selecting')) this.clear(false);
    });
    document.addEventListener('pointercancel', () => {
      this.selecting = false;
      syncSelection();
      if (!copy.classList.contains('ink-selecting')) this.clear(false);
    });
  }
  prepare() {
    const definitions = document.createElementNS(SVG, 'svg');
    definitions.classList.add('ink-bleed-definitions');
    definitions.setAttribute('aria-hidden', 'true');
    definitions.setAttribute('focusable', 'false');
    document.body.append(definitions);
    for (const paragraph of this.copy.querySelectorAll('p')) {
      const filter = this.createFilter(definitions);
      const source = document.createElement('span');
      source.className = 'ink-source';
      // Keep semantic inline content and its native focus/hover hit area.
      source.append(...paragraph.childNodes);
      const layer = document.createElement('span');
      layer.className = 'ink-bleed';
      layer.setAttribute('aria-hidden', 'true');
      const ink = document.createElement('span');
      ink.className = 'ink-bleed-copy';
      ink.style.filter = `url('#${filter.id}')`;
      const glyphs = [];
      const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const linked = Boolean(node.parentElement.closest('.intro-link'));
        for (const word of node.textContent.split(/(\s+)/)) {
          if (!word.trim()) { ink.append(document.createTextNode(word)); continue; }
          const wrapper = document.createElement('span');
          wrapper.className = 'ink-word';
          // Linked glyphs keep the same ink motion with their own red underline.
          if (linked) wrapper.classList.add('ink-linked-word');
          for (const character of word) {
            const letter = document.createElement('span');
            letter.className = 'ink-letter';
            letter.textContent = character;
            wrapper.append(letter);
            glyphs.push({ letter, wrapper, x: 0, y: 0 });
          }
          ink.append(wrapper);
        }
      }
      layer.append(ink);
      // The source remains selectable; only the decorative copy is painted.
      paragraph.replaceChildren(source, layer);
      this.layers.push(layer);
      const measure = () => {
        paragraph.classList.toggle('has-runt', hasRuntLastLine(source));
        for (const glyph of glyphs) {
          glyph.x = glyph.wrapper.offsetLeft + glyph.letter.offsetLeft + glyph.letter.offsetWidth / 2 + 8;
          glyph.y = glyph.wrapper.offsetTop + glyph.letter.offsetTop + glyph.letter.offsetHeight / 2 + 8;
        }
      };
      measure();
      this.measurements.push(measure);
      const draw = state => this.drawInk(filter, glyphs, state);
      this.entries.push({ paragraph, layer, draw, current: { x: 0, y: 0, strength: 0 }, target: { x: 0, y: 0, strength: 0 } });
    }
    const contacts = this.copy.querySelector('.paper-contact');
    if (contacts) {
      const filter = this.createFilter(definitions);
      const glyphs = Array.from(contacts.querySelectorAll('.contact-link img'), letter => {
        letter.classList.add('ink-icon');
        // Paint only the icon through the ink filter, keeping its tooltip crisp.
        letter.style.filter = `url('#${filter.id}')`;
        return { letter, wrapper: letter.parentElement, x: 0, y: 0 };
      });
      const measure = () => {
        for (const glyph of glyphs) {
          glyph.x = glyph.wrapper.offsetLeft + glyph.letter.offsetLeft + glyph.letter.offsetWidth / 2 + 8;
          glyph.y = glyph.wrapper.offsetTop + glyph.letter.offsetTop + glyph.letter.offsetHeight / 2 + 8;
        }
      };
      measure();
      this.measurements.push(measure);
      this.entries.push({ paragraph: contacts, draw: state => this.drawInk(filter, glyphs, state),
        current: { x: 0, y: 0, strength: 0 }, target: { x: 0, y: 0, strength: 0 } });
    }
    this.copy.dataset.inkHover = 'ready';
  }
  createFilter(definitions) {
    const filter = document.createElementNS(SVG, 'filter');
    filter.id = `intro-ink-goo-${this.entries.length}`;
    for (const [key, value] of Object.entries({ x: '-25%', y: '-15%', width: '150%', height: '130%', 'color-interpolation-filters': 'sRGB' })) filter.setAttribute(key, value);
    filter.innerHTML = `<feMorphology in="SourceGraphic" operator="dilate" radius="0" result="grown"/>
      <feGaussianBlur in="grown" stdDeviation="0" result="soft"/>
      <feColorMatrix in="soft" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="goo"/>
      <feTurbulence type="fractalNoise" baseFrequency=".045 .085" numOctaves="2" seed="17" result="fibers"/>
      <feDisplacementMap in="goo" in2="fibers" scale="0" xChannelSelector="R" yChannelSelector="G"/>`;
    definitions.append(filter);
    return filter;
  }
  drawInk(filter, glyphs, { x, y, strength }) {
    filter.children[0].setAttribute('radius', (.2 * strength).toFixed(3));
    filter.children[1].setAttribute('stdDeviation', (.65 * strength).toFixed(3));
    filter.children[2].setAttribute('values', `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${1 + 15 * strength} ${-5.4 * strength}`);
    filter.children[4].setAttribute('scale', (1.8 * strength).toFixed(3));
    glyphs.forEach((glyph, index) => {
      const dx = x - glyph.x, dy = y - glyph.y;
      const wet = Math.exp(-((dx / 62) ** 2) - (dy / 38) ** 2) * strength;
      glyph.letter.style.setProperty('--ink-stroke', `${(.35 * wet).toFixed(3)}px`);
      glyph.letter.style.setProperty('--ink-pull-x', `${(dx * wet * .12).toFixed(2)}px`);
      glyph.letter.style.setProperty('--ink-pull-y', `${(dy * wet * .18).toFixed(2)}px`);
      glyph.letter.style.setProperty('--ink-swell-x', (1 + wet * .65).toFixed(3));
      glyph.letter.style.setProperty('--ink-swell-y', (1 + wet * .45).toFixed(3));
      glyph.letter.style.setProperty('--ink-turn', `${(Math.sin(index * 2.4) * wet * 3.5).toFixed(2)}deg`);
    });
  }
  requestDraw() {
    if (this.suspended) return;
    if (this.frame !== null || !this.entries.some(entry => Object.keys(entry.target).some(key => entry.current[key] !== entry.target[key]))) return;
    this.frame = requestAnimationFrame(now => {
      this.frame = null;
      const elapsed = this.lastTime === null ? 16 : now - this.lastTime;
      this.lastTime = now;
      for (const entry of this.entries) {
        entry.current = advanceInk(entry.current, entry.target, elapsed);
        entry.draw(entry.current);
      }
      this.requestDraw();
      if (this.frame === null) this.lastTime = null;
    });
  }
  setSuspended(suspended) {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    if (suspended) this.clear();
  }
  clear(immediate = true) {
    for (const entry of this.entries) {
      entry.target.strength = 0;
      if (immediate) { entry.current = { ...entry.target }; entry.draw(entry.current); }
    }
    if (immediate) { cancelAnimationFrame(this.frame); this.frame = null; this.lastTime = null; }
    else this.requestDraw();
  }
}
