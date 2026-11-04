// Writes public/assets/pambudi-frame-paper.svg: the welcome's traced frame
// (pambudi-frame.svg) placed on the paper as FRAME_REGISTRATION places it,
// in a box FRAME_MARGIN larger than the paper on every side, transparent
// outside the frame. The welcome shows the same drawing in the same place;
// its box now covers the paper, so the welcome counts as the page's largest
// content from the moment it shows. Run after replacing pambudi-frame.svg:
//
//     node tools/paper-frame.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { FRAME_REGISTRATION as R, FRAME_MARGIN } from '../src/paper/frame-registration.mjs';

const source = readFileSync(new URL('../public/assets/pambudi-frame.svg', import.meta.url), 'utf8');
const [, width, height] = source.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
const drawing = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
// Fill the registered box exactly, as the embossed ornament does: fitting
// it with kept proportions left it ~26 units short of the emboss vertically.
const sx = R.width / width, sy = R.height / height;
const box = [-FRAME_MARGIN * R.paperWidth, -FRAME_MARGIN * R.paperHeight,
  R.paperWidth * (1 + 2 * FRAME_MARGIN), R.paperHeight * (1 + 2 * FRAME_MARGIN)].map(n => +n.toFixed(3));
writeFileSync(new URL('../public/assets/pambudi-frame-paper.svg', import.meta.url),
  `<svg width="${box[2]}" height="${box[3]}" viewBox="${box.join(' ')}" fill="none" xmlns="http://www.w3.org/2000/svg">`
  + `<g transform="translate(${+R.x.toFixed(4)} ${+R.y.toFixed(4)}) scale(${+sx.toFixed(7)} ${+sy.toFixed(7)})">${drawing}</g></svg>\n`);
