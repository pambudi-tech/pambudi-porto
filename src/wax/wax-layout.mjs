export const WAX_ASPECT = 768 / 280;

// One height of end caps stays rigid. The middle absorbs width changes.
export function waxLayout(labelWidth, { height = 48, maxWidth = Infinity } = {}) {
  const minimum = height * WAX_ASPECT;
  const width = Math.min(Math.max(minimum, labelWidth + height * 1.25), Math.max(minimum, maxWidth));
  return { width, height, extension: width / height - WAX_ASPECT,
    labelWidth: Math.max(0, width - height * 1.25) };
}

export function extendWaxX(x, extension) {
  return x + Math.max(-.5, Math.min(.5, x / (WAX_ASPECT - 1))) * extension;
}
