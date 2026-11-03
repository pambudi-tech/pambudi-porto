import { clamp } from '../shared/math.mjs';

// The relit seal's entrance: molten wax pours and spreads, flat and glowing;
// it cools as its lip rises; a stamp presses its middle down and the label
// in; a low light runs along the lip, and the room's light takes over.
export const WAX_POUR = Object.freeze({ duration: 1400 });

const span = (ms, from, to) => clamp((ms - from) / (to - from));
const outCubic = t => 1 - (1 - t) ** 3;
const inOutSine = t => (1 - Math.cos(Math.PI * t)) / 2;
// Past 1 and back: the stamp goes a little deep before it lifts.
const outBack = t => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

// Each part, 0 to 1, `ms` after the pour begins.
export function pourAt(ms) {
  const cool = inOutSine(span(ms, 250, 900));
  const pressed = span(ms, 820, 1100);
  const glint = span(ms, 1000, WAX_POUR.duration);
  return {
    pour: outCubic(span(ms, 0, 560)),
    molten: 1 - cool,
    cool,
    press: pressed > 0 ? outBack(pressed) : 0,
    label: inOutSine(pressed),
    // The glint rises and falls; its lamp runs left to right as it does.
    glint: Math.sin(Math.PI * glint),
    sweep: inOutSine(glint),
    done: ms >= WAX_POUR.duration,
  };
}

// The glint's lamp, low over the lip, in the seal's space (wax-light.mjs).
export const glintLamp = (sweep, aspect) => [(sweep - .5) * aspect * 1.3, .62, .42];
