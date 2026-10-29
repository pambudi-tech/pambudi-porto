import { createNativeInkLayer } from './native-ink.mjs';

// Each glyph has independent ink deposits. This field controls an alpha mask;
// the visible lettering always remains the original browser-rendered text.
export function growthField(rgba, width, height, glyphs, random = Math.random) {
  const arrival = new Float32Array(width * height).fill(1);
  const covered = new Uint8Array(width * height);
  for (const glyph of glyphs) {
    const points = [];
    for (let y = Math.max(0, glyph.top); y < Math.min(height, glyph.bottom); y++) {
      for (let x = Math.max(0, glyph.left); x < Math.min(width, glyph.right); x++) {
        const index = y * width + x;
        if (rgba[index * 4 + 3]) points.push({ x, y, index });
      }
    }
    if (!points.length) continue;
    const seeds = Array.from({ length: Math.min(3, Math.max(1, Math.ceil(points.length / 90))) }, () => points[Math.floor(random() * points.length)]);
    const distances = points.map(point => Math.min(...seeds.map(seed => Math.hypot(point.x - seed.x, point.y - seed.y))));
    const maximum = Math.max(1, ...distances);
    points.forEach((point, i) => {
      const value = .035 + distances[i] / maximum * .79 + random() * .065;
      arrival[point.index] = Math.min(arrival[point.index], value);
      covered[point.index] = 1;
    });
  }
  const pixels = [];
  for (let index = 0; index < arrival.length; index++) {
    if (!rgba[index * 4 + 3]) continue;
    if (!covered[index]) arrival[index] = .15 + random() * .65;
    pixels.push(index);
  }
  return { pixels: Uint32Array.from(pixels), arrival, source: rgba };
}

export function revealInk(target, field, progress) {
  for (const index of field.pixels) {
    const offset = index * 4;
    const amount = Math.max(0, Math.min(1, (progress - field.arrival[index] + .14) / .14));
    const wetEdge = amount * amount * (3 - 2 * amount);
    target[offset + 3] = Math.round(field.source[offset + 3] * wetEdge * Math.min(1, progress * 6));
  }
}

export function createInkLayer(paragraph, { shapeText = false } = {}) {
  const style = getComputedStyle(paragraph);
  const bounds = paragraph.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(bounds.width * dpr));
  canvas.height = Math.max(1, Math.ceil(bounds.height * dpr));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.scale(dpr, dpr);
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  context.fillStyle = style.color;
  context.textBaseline = 'alphabetic';
  const glyphs = [];
  const content = paragraph.querySelector('.ink-bleed-copy') ?? paragraph;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node;
  while ((node = walker.nextNode())) {
    let offset = 0;
    for (const character of node.textContent) {
      range.setStart(node, offset);
      range.setEnd(node, offset + character.length);
      offset += character.length;
      if (!character.trim()) continue;
      const rect = range.getBoundingClientRect();
      const metrics = context.measureText(character);
      const x = rect.left - bounds.left, y = rect.top - bounds.top;
      const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize) * .8;
      if (!shapeText) context.fillText(character, x, y + ascent);
      glyphs.push({ left: Math.floor(x * dpr), right: Math.ceil((x + rect.width) * dpr), top: Math.floor(y * dpr), bottom: Math.ceil((y + rect.height) * dpr) });
    }
  }
  if (shapeText) {
    // Render the welcome line as a run, preserving joined script letters and
    // kerning. Its individual glyph bounds still seed the same ink growth.
    const text = content.textContent;
    const metrics = context.measureText(text);
    range.selectNodeContents(content);
    const rect = range.getBoundingClientRect();
    const x = style.textAlign === 'center' ? (bounds.width - metrics.width) / 2 : rect.left - bounds.left;
    context.fillText(text, x, rect.top - bounds.top + (metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize) * .8));
  }
  const source = context.getImageData(0, 0, canvas.width, canvas.height);
  const field = growthField(source.data, canvas.width, canvas.height, glyphs);
  const padding = Math.ceil(8 * dpr);
  const density = document.createElement('canvas');
  density.width = canvas.width + padding * 2;
  density.height = canvas.height + padding * 2;
  const densityContext = density.getContext('2d');
  const mask = densityContext.createImageData(density.width, density.height);
  for (let y = 0; y < density.height; y++) for (let x = 0; x < density.width; x++) {
    const col = x - padding, row = y - padding;
    const index = row * canvas.width + col;
    const inside = col >= 0 && row >= 0 && col < canvas.width && row < canvas.height;
    // Flamboyant script strokes can extend outside their measured glyph box.
    // Give those areas a continuous growth field too, rather than a late pop.
    const fallback = .25 + .2 * (1 + Math.sin(x / (9 * dpr)) * Math.sin(y / (7 * dpr)));
    const arrival = inside && field.arrival[index] < 1 ? field.arrival[index] : fallback;
    mask.data.set([255, 255, 255, Math.round((1 - arrival) * 255)], (y * density.width + x) * 4);
  }
  densityContext.putImageData(mask, 0, 0);
  return createNativeInkLayer(paragraph, density.toDataURL(), {
    width: canvas.width / dpr, height: canvas.height / dpr, padding: padding / dpr,
  });
}

export function createImageInkLayer(image) {
  const style = getComputedStyle(image);
  const width = Math.max(1, parseFloat(style.width) || image.clientWidth);
  const height = Math.max(1, parseFloat(style.height) || image.clientHeight);
  const density = document.createElement('canvas');
  density.width = Math.min(512, Math.ceil(width));
  density.height = Math.max(1, Math.ceil(density.width * height / width));
  const context = density.getContext('2d');
  const mask = context.createImageData(density.width, density.height);
  for (let y = 0; y < density.height; y++) for (let x = 0; x < density.width; x++) {
    const u = x / density.width, v = y / density.height;
    const distance = Math.hypot((u - .5) * 1.2, v - .5);
    const organic = .5 + .22 * Math.sin(u * 23 + Math.sin(v * 11))
      + .16 * Math.sin(v * 31 - u * 9) + .1 * Math.sin((u + v) * 57);
    const arrival = Math.min(.88, .06 + distance * .8 + organic * .2);
    mask.data.set([255, 255, 255, Math.round((1 - arrival) * 255)], (y * density.width + x) * 4);
  }
  context.putImageData(mask, 0, 0);
  return createNativeInkLayer(image, density.toDataURL(), { width, height, padding: 0 });
}
