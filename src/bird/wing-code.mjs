// The wing poses' cells written two characters to a cell, x then y, each a
// place in WING_CODE (tools/build-wing-poses.mjs).
export const WING_CODE = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-.~+=';

const place = new Map([...WING_CODE].map((char, index) => [char, index]));

export const decodeWingPoses = poses => poses.map(pose =>
  Array.from({ length: pose.length / 2 }, (_, i) => [place.get(pose[2 * i]), place.get(pose[2 * i + 1])]));
