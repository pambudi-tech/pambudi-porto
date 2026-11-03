import { clamp } from '../shared/math.mjs';

// The relit seal's entrance, as sealing wax behaves. Melted, it is the same
// red, only wet and glossy. It pools as a thick dome with its own uneven
// outline, spreading quickly, then slower and slower. A stamp comes down,
// its shadow first; pressing squeezes the puddle out into the seal's
// outline, rolling up the lip and pressing the middle a little past rest. The stamp lifts
// and leaves the impression, label and all, and the wet gloss dulls to the
// seal's satin as it sets.
export const WAX_POUR = Object.freeze({ duration: 2800 });

const span = (ms, from, to) => clamp((ms - from) / (to - from));
const inOutSine = t => (1 - Math.cos(Math.PI * t)) / 2;
// Viscous: quick at first, then slower and slower.
const viscous = t => 1 - (1 - t) ** 2.6;
// The stamp's press: wax squeezed out fast, then held.
const squeeze = t => 1 - (1 - t) ** 3;

// Each part, `ms` after the pour begins. `spread` is the puddle's size,
// `form` how far it has become the stamped seal, `press` the
// middle's depth (past 1 while the stamp holds it down), `wet` the melted
// gloss, `stamp` the stamp's shadow and `label` the impression's lettering.
export function pourAt(ms) {
  const pressing = squeeze(span(ms, 1250, 1550));
  const lifting = inOutSine(span(ms, 1750, 2000));
  return {
    spread: viscous(span(ms, 0, 1150)),
    form: pressing,
    press: pressing * (1 + .12 * (1 - lifting)),
    wet: 1 - inOutSine(span(ms, 1850, WAX_POUR.duration)),
    stamp: inOutSine(span(ms, 950, 1300)) * (1 - lifting),
    label: span(ms, 1780, 1880),
    done: ms >= WAX_POUR.duration,
  };
}
