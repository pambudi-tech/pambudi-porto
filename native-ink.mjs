const SVG = 'http://www.w3.org/2000/svg';
let sequence = 0;
const clamp = value => Math.max(0, Math.min(1, value));

export function nativeInkFrame(progress) {
  // Finish the mask early, leaving the last tenth of the entrance completely
  // identical to the resting text before its filter is cleaned up.
  const reveal = clamp(progress / .9);
  return {
    intercept: (reveal - .86) / .14,
    opacity: clamp(progress * 6),
    soak: reveal === 1 ? 0 : Math.sin(Math.PI * reveal) ** 2 * .35,
  };
}

export function createNativeInkLayer(paragraph, densityURL, { width, height, padding }) {
  const make = (name, attributes = {}) => {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const id = `entrance-ink-${++sequence}`;
  const definitions = make('svg', { class: 'ink-bleed-definitions', 'aria-hidden': 'true', focusable: 'false' });
  const filter = make('filter', { id, x: '-20%', y: '-30%', width: '140%', height: '160%',
    'color-interpolation-filters': 'sRGB', primitiveUnits: 'userSpaceOnUse' });
  const density = make('feImage', { href: densityURL, x: -padding, y: -padding,
    width: width + padding * 2, height: height + padding * 2, preserveAspectRatio: 'none', result: 'density' });
  const threshold = make('feComponentTransfer', { in: 'density', result: 'front' });
  const alpha = make('feFuncA', { type: 'linear', slope: 1 / .14, intercept: -1 / .14 });
  threshold.append(alpha);
  const smooth = make('feComponentTransfer', { in: 'front', result: 'mask' });
  smooth.append(make('feFuncA', { type: 'table', tableValues: '0 .15625 .5 .84375 1' }));
  const ink = make('feComposite', { in: 'SourceGraphic', in2: 'mask', operator: 'in', result: 'ink' });
  const opacity = make('feComponentTransfer', { in: 'ink', result: 'growth' });
  const strength = make('feFuncA', { type: 'linear', slope: 0 });
  opacity.append(strength);
  const blur = make('feGaussianBlur', { in: 'growth', stdDeviation: .65, result: 'soft' });
  const wet = make('feComponentTransfer', { in: 'soft', result: 'soak' });
  const wetStrength = make('feFuncA', { type: 'linear', slope: 0 });
  wet.append(wetStrength);
  const merge = make('feMerge');
  merge.append(make('feMergeNode', { in: 'soak' }), make('feMergeNode', { in: 'growth' }));
  filter.append(density, threshold, smooth, ink, opacity, blur, wet, merge);
  definitions.append(filter);
  document.body.append(definitions);
  const previous = paragraph.style.filter;
  paragraph.style.filter = `${previous ? `${previous} ` : ''}url("#${id}")`;
  let finished = false;
  const draw = progress => {
    const frame = nativeInkFrame(progress);
    alpha.setAttribute('intercept', String(frame.intercept));
    strength.setAttribute('slope', String(frame.opacity));
    wetStrength.setAttribute('slope', String(frame.soak));
  };
  draw(0);
  return {
    draw,
    finish() {
      if (finished) return;
      finished = true;
      // The browser has painted these same DOM glyphs throughout. Cleanup
      // cannot swap fonts, baselines, shaping, or rasterized letter outlines.
      if (previous) paragraph.style.filter = previous;
      else paragraph.style.removeProperty('filter');
      definitions.remove();
    },
  };
}
