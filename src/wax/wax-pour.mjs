import { clamp } from '../shared/math.mjs';

// The relit seal's entrance, as sealing wax behaves. Melted, it is the same
// red, only wet and glossy. It pools as a thick dome with its own uneven
// outline, spreading quickly, then slower and slower. A stamp comes down,
// its shadow first; pressing squeezes the puddle out into the seal's
// outline, rolling up the lip and pressing the middle a little past rest. The stamp lifts
// and leaves the impression, label and all, and the wet gloss dulls to the
// seal's satin as it sets.
export const WAX_POUR = Object.freeze({ duration: 3300 });

const span = (ms, from, to) => clamp((ms - from) / (to - from));
const inOutSine = t => (1 - Math.cos(Math.PI * t)) / 2;
// Viscous: quick at first, then slower and slower.
const viscous = t => 1 - (1 - t) ** 2.6;
// The stamp's press, with weight: it meets the wax gently, squeezes it out
// decisively, and eases to a stop against the wax's resistance, rather
// than snapping most of the way in its first moment.
const squeeze = t => (t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

// Each part, `ms` after the pour begins. `spread` is the puddle's size,
// `form` how far it has become the stamped seal, `press` the
// middle's depth (past 1 while the stamp holds it down), `wet` the melted
// gloss, `stamp` the stamp's shadow and `label` the impression's lettering.
export function pourAt(ms) {
  // The stamp descends (its shadow gathering) over 550ms, presses over
  // 600ms, holds a beat, and lifts away over 450ms.
  const pressing = squeeze(span(ms, 1400, 2000));
  const lifting = inOutSine(span(ms, 2250, 2700));
  return {
    spread: viscous(span(ms, 0, 1150)),
    form: pressing,
    press: pressing * (1 + .12 * (1 - lifting)),
    wet: 1 - inOutSine(span(ms, 2350, WAX_POUR.duration)),
    // Its shadow gathers as it comes down, then gives way as it presses:
    // a hint of the stamp, not a darkening of the wax.
    stamp: inOutSine(span(ms, 950, 1500)) * (1 - .7 * pressing) * (1 - lifting),
    label: inOutSine(span(ms, 2280, 2480)),
    done: ms >= WAX_POUR.duration,
  };
}
