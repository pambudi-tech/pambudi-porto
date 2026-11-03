// The wax seal's lamp, in the seal's own space as wax-gl.mjs draws it:
// x right, y up, z toward the viewer, one unit = the seal's height. Pointer
// positions arrive in half-widths and half-heights of the seal, y down.

// At rest the lamp hangs above the seal's upper left, as in its photograph.
export const WAX_REST = Object.freeze({ x: -.55, y: -.9 });
// The lettering's own red.
export const WAX_INK = Object.freeze([183, 26, 32]);

export const lampInSeal = ({ x, y }, aspect, lift) => [x * aspect / 2, -y / 2, lift];

// The satin field under a lamp `lift` above it, `across` away from the
// point beneath it: wrapped diffuse and a soft gloss, as in wax-gl.mjs.
export function fieldLight(across, lift, gloss) {
  const facing = lift / Math.hypot(across, lift);
  const diffuse = Math.max((facing + .25) / 1.25, 0);
  const nh = Math.sqrt((1 + facing) / 2);
  const shine = (nh ** (gloss * .545) * 1.7 * .3 + nh ** (gloss * .18) * .22) * Math.min(1, facing / .2) * .64;
  return { diffuse: .36 + .9 * diffuse, shine };
}

// The ink is lit like the field it is pressed into, measured against the
// resting light so that at rest it keeps its own red.
export function inkColour(across, lift, resting, gloss) {
  const { diffuse, shine } = fieldLight(across, lift, gloss);
  const gleam = 255 * Math.max(0, shine - resting.shine);
  return WAX_INK.map(value => Math.round(Math.min(255, value * diffuse / resting.diffuse + gleam)));
}

// The lettering's fill: the lamp's falloff around the point beneath it.
// `unit` is the seal's height in pixels and `centre` where the seal's middle
// falls in the label's box; `light` and `rest` are lamps in the seal's space.
export function labelFill(light, rest, { unit, centre: [cx, cy], gloss }) {
  const lift = light[2] * unit;
  const resting = fieldLight(Math.hypot(rest[0], rest[1]) * unit, rest[2] * unit, gloss);
  const stops = [0, .25, .5, .8, 1.2, 1.8, 2.6, 4].map(step => {
    const [r, g, b] = inkColour(step * unit, lift, resting, gloss);
    return `rgb(${r} ${g} ${b}) ${Math.round(step * unit)}px`;
  });
  const left = cx + light[0] * unit, top = cy - light[1] * unit;
  return `radial-gradient(circle at ${left.toFixed(1)}px ${top.toFixed(1)}px, ${stops.join(', ')})`;
}
