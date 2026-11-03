import { clamp } from '../shared/math.mjs';

// The paper's ink takes the paper's lamp (paper-gl.mjs): printed on the
// surface, with no relief of its own, a word is a touch lighter as the lamp
// comes over it, with a faint sheen right beneath it, and a touch darker as
// the lamp moves away. At rest the ink is exactly its own colour.
export const INK_LIGHT = Object.freeze({ shade: 1, sheen: .35, tightness: 120, darkest: .82, lightest: 1.45 });

// How bright a word's ink is, at its middle `[x, y]` on the sheet (paper
// space: one unit = the sheet's height, from its middle, y down), under
// `lamp` and measured against `rest`.
export function inkBrightness([x, y], lamp, rest) {
  const facing = ([lx, ly, lz]) => lz / Math.hypot(lx - x, ly - y, lz);
  const sheen = value => Math.sqrt((1 + value) / 2) ** INK_LIGHT.tightness * INK_LIGHT.sheen;
  const now = facing(lamp), resting = facing(rest);
  return clamp(1 + (now - resting) * INK_LIGHT.shade + sheen(now) - sheen(resting), INK_LIGHT.darkest, INK_LIGHT.lightest);
}

// The words on each face of the sheet: the front's ink words and contact
// links, and the About text on the back.
const FACES = {
  white: ['.paper-front', face => face.querySelectorAll('.ink-bleed .ink-word, .paper-contact .contact-link')],
  red: ['.paper-back', face => [...face.querySelectorAll('.about-resume *')]
    .filter(element => element.matches('img') || (!element.children.length && element.textContent.trim()))],
};

export class PaperInkLight {
  constructor(paper) {
    this.paper = paper;
    this.measured = {};
    // Forgetting where the words are also lets go of their light, so none is
    // left on a word that is not measured again until the lamp next moves.
    const forget = () => {
      for (const words of Object.values(this.measured)) for (const word of words) word.element.style.filter = '';
      this.measured = {};
    };
    new ResizeObserver(forget).observe(paper);
    paper.querySelector('.about-resume')?.addEventListener('scroll', forget, { passive: true });
  }
  // Where each word sits on its face's sheet; read again after a resize or
  // a scroll, never while lighting.
  measure(side) {
    const [selector, pick] = FACES[side];
    const face = this.paper.querySelector(selector);
    const frame = face?.querySelector('.portfolio-frame')?.getBoundingClientRect();
    if (!frame?.height) return [];
    return [...pick(face)].map(element => {
      const box = element.getBoundingClientRect();
      // Its own filter stays first (the signature's white, say); the light
      // goes on top of it.
      const own = getComputedStyle(element).filter;
      return { element, own: own === 'none' ? '' : `${own} `,
        at: [(box.left + box.width / 2 - frame.left - frame.width / 2) / frame.height,
          (box.top + box.height / 2 - frame.top - frame.height / 2) / frame.height], brightness: 1 };
    });
  }
  // Lights the face that shows with the paper's lamp, now and at rest.
  update(lamp, rest) {
    const side = this.paper.dataset.paperSide === 'red' ? 'red' : 'white';
    // At rest every word is its own colour: nothing to measure or light yet,
    // which keeps the page's start free of it.
    const resting = lamp.every((value, i) => Math.abs(value - rest[i]) < 1e-4);
    if (resting && !this.measured[side]?.some(word => word.brightness !== 1)) return;
    if (!this.measured[side]?.length) this.measured[side] = this.measure(side);
    for (const word of this.measured[side]) {
      const brightness = inkBrightness(word.at, lamp, rest);
      // Small changes wait for a larger one, except the return to rest.
      if (brightness === word.brightness || (brightness !== 1 && Math.abs(brightness - word.brightness) < .004)) continue;
      word.brightness = brightness;
      word.element.style.filter = brightness === 1 ? '' : `${word.own}brightness(${brightness.toFixed(3)})`;
    }
  }
}
