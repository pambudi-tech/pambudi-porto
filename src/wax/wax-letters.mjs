// The label's letters as a height map for the relit wax (wax-gl.mjs): drawn
// where the label sits in its seal, in its own font, size and line breaks,
// and softened so each letter rises from the wax with a rounded bevel.

// Words greedily to lines no wider than `width`, as the browser wraps them.
export function wrapWords(words, width, measure) {
  const lines = [];
  for (const word of words) {
    const line = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
    if (lines.length && measure(line) <= width) lines[lines.length - 1] = line;
    else lines.push(word);
  }
  return lines;
}

// `label` is laid out inside `seal`; the map covers the seal at `scale`
// pixels per CSS pixel, the size the seal's canvas is drawn at.
export function drawLetters(canvas, label, seal, scale) {
  const width = Math.max(1, Math.round(seal.offsetWidth * scale));
  const height = Math.max(1, Math.round(seal.offsetHeight * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const style = getComputedStyle(label);
  const size = parseFloat(style.fontSize);
  const lineHeight = (parseFloat(style.lineHeight) || size * 1.1) * scale;
  context.font = `${style.fontWeight} ${size * scale}px ${style.fontFamily}`;
  if ('letterSpacing' in context) context.letterSpacing = `${parseFloat(style.letterSpacing) * scale || 0}px`;
  const lines = wrapWords(label.textContent.trim().split(/\s+/), label.clientWidth * scale + 1,
    text => context.measureText(text).width);
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  // A soft edge is the bevel: the stroke's middle stands highest.
  context.filter = `blur(${(size * scale * .035).toFixed(2)}px)`;
  const box = (label.offsetHeight - parseFloat(style.paddingBottom || 0)) * scale;
  const top = label.offsetTop * scale + (box - lines.length * lineHeight) / 2;
  const middle = (label.offsetLeft + label.offsetWidth / 2) * scale;
  lines.forEach((line, i) => context.fillText(line, middle, top + (i + .5) * lineHeight));
  return canvas;
}
