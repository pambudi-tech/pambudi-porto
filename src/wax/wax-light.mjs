// The wax seal's lamp, in the seal's own space as wax-gl.mjs draws it:
// x right, y up, z toward the viewer, one unit = the seal's height. Pointer
// positions arrive in half-widths and half-heights of the seal, y down.

// At rest the lamp hangs above the seal's upper left, as in its photograph.
export const WAX_REST = Object.freeze({ x: -.55, y: -.9 });
// The lettering's own red.
export const WAX_INK = Object.freeze([183, 26, 32]);

export const lampInSeal = ({ x, y }, aspect, lift) => [x * aspect / 2, -y / 2, lift];

// How the wax answers each lamp. The paper's room light is far off: less
// glow and a tighter highlight, so at rest the seal matches its photograph.
// A hover brings a close lamp, at its full gloss.
export const WAX_ROOM = Object.freeze({ level: .8, sheen: .1, gloss: 110 });
export const WAX_HOVER = Object.freeze({ level: 1, sheen: 1, gloss: 60, lift: .9 });
export const waxFinish = (room, amount) => Object.fromEntries(['level', 'sheen', 'gloss']
  .map(key => [key, room[key] + (WAX_HOVER[key] - room[key]) * amount]));
export const mixLamp = (from, to, amount) => from.map((value, i) => value + (to[i] - value) * amount);

// The paper's lamp (paper-gl.mjs: one unit = the sheet's height, from its
// middle, y down) seen from a seal whose middle and height are in the same
// units.
export const paperLampInSeal = (lamp, { x, y, height }) =>
  [(lamp[0] - x) / height, -(lamp[1] - y) / height, lamp[2] / height];

// Where the seal's own shadow falls on the paper, in pixels: away from the
// lamp, longer as it lowers, never more than a few pixels for its size.
export function sealShadow(lamp, size) {
  const lift = Math.max(lamp[2], .3), reach = size * .05;
  const x = -lamp[0] / lift * reach, y = lamp[1] / lift * reach;
  const scale = Math.min(1, size * .12 / Math.max(Math.hypot(x, y), 1e-6));
  return [x * scale, y * scale];
}

// The satin field under a lamp `lift` above it, `across` away from the
// point beneath it: wrapped diffuse and a soft gloss, as in wax-gl.mjs.
export function fieldLight(across, lift, gloss, sheen = 1) {
  const facing = lift / Math.hypot(across, lift);
  const diffuse = Math.max((facing + .25) / 1.25, 0);
  const nh = Math.sqrt((1 + facing) / 2);
  const shine = (nh ** (gloss * .545) * 1.7 * .3 + nh ** (gloss * .18) * .22 * sheen) * Math.min(1, facing / .2) * .64;
  return { diffuse: .36 + .9 * diffuse, shine };
}

// The ink is lit like the field it is pressed into, measured against the
// resting light so that at rest it keeps its own red.
export function inkColour(across, lift, resting, gloss, sheen = 1) {
  const { diffuse, shine } = fieldLight(across, lift, gloss, sheen);
  const gleam = 255 * Math.max(0, shine - resting.shine);
  return WAX_INK.map(value => Math.round(Math.min(255, value * diffuse / resting.diffuse + gleam)));
}

// The lettering's fill: the lamp's falloff around the point beneath it.
// `unit` is the seal's height in pixels and `centre` where the seal's middle
// falls in the label's box; `light` and `rest` are lamps in the seal's space.
export function labelFill(light, rest, { unit, centre: [cx, cy], gloss, sheen = 1 }) {
  const lift = light[2] * unit;
  const resting = fieldLight(Math.hypot(rest[0], rest[1]) * unit, rest[2] * unit, gloss, sheen);
  const stops = [0, .25, .5, .8, 1.2, 1.8, 2.6, 4].map(step => {
    const [r, g, b] = inkColour(step * unit, lift, resting, gloss, sheen);
    return `rgb(${r} ${g} ${b}) ${Math.round(step * unit)}px`;
  });
  const left = cx + light[0] * unit, top = cy - light[1] * unit;
  return `radial-gradient(circle at ${left.toFixed(1)}px ${top.toFixed(1)}px, ${stops.join(', ')})`;
}
