// Each glyph has independent ink deposits. A shared canvas draws their growth.
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

function soakTexture(image, field, width, height, dpr) {
  const smooth = value => value * value * (3 - 2 * value);
  const fields = [32, 12, 3].map(size => {
    size *= dpr;
    const columns = Math.ceil(width / size) + 2;
    const rows = Math.ceil(height / size) + 2;
    return { size, columns, values: Array.from({ length: columns * rows }, Math.random) };
  });
  const noise = (grid, x, y) => {
    const px = x / grid.size, py = y / grid.size;
    const col = Math.floor(px), row = Math.floor(py);
    const fx = smooth(px - col), fy = smooth(py - row);
    const a = grid.values[row * grid.columns + col], b = grid.values[row * grid.columns + col + 1];
    const c = grid.values[(row + 1) * grid.columns + col], d = grid.values[(row + 1) * grid.columns + col + 1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  for (const index of field.pixels) {
    const x = index % width, y = Math.floor(index / width);
    const value = noise(fields[0], x, y) * .6 + noise(fields[1], x, y) * .28 + noise(fields[2], x, y) * .12;
    const coverage = smooth(Math.max(0, Math.min(1, (value - .3) / .4)));
    image.data[index * 4 + 3] = Math.round(field.source[index * 4 + 3] * coverage);
  }
}

export function createInkLayer(paragraph) {
  const style = getComputedStyle(paragraph);
  const bounds = paragraph.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.className = 'ink-growth';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = Math.max(1, Math.ceil(bounds.width * dpr));
  canvas.height = Math.max(1, Math.ceil(bounds.height * dpr));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.scale(dpr, dpr);
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  context.fillStyle = style.color;
  context.textBaseline = 'alphabetic';
  const glyphs = [];
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
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
      context.fillText(character, x, y + ascent);
      glyphs.push({ left: Math.floor(x * dpr), right: Math.ceil((x + rect.width) * dpr), top: Math.floor(y * dpr), bottom: Math.ceil((y + rect.height) * dpr) });
    }
  }
  const source = context.getImageData(0, 0, canvas.width, canvas.height);
  const field = growthField(source.data, canvas.width, canvas.height, glyphs);
  // Preserve the soft, irregular soak beneath the growth of individual glyphs.
  const soak = document.createElement('canvas');
  soak.className = 'ink-soak';
  soak.setAttribute('aria-hidden', 'true');
  soak.width = canvas.width;
  soak.height = canvas.height;
  const wet = context.createImageData(canvas.width, canvas.height);
  wet.data.set(source.data);
  soakTexture(wet, field, canvas.width, canvas.height, dpr);
  soak.getContext('2d').putImageData(wet, 0, 0);
  const image = context.createImageData(canvas.width, canvas.height);
  image.data.set(source.data);
  revealInk(image.data, field, 0);
  context.putImageData(image, 0, 0);
  paragraph.append(canvas, soak);
  return {
    canvas,
    soak,
    draw(progress) {
      revealInk(image.data, field, progress);
      context.putImageData(image, 0, 0);
    },
  };
}
