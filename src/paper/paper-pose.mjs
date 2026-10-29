// One pose writer keeps the dark loader paper aligned with the real sheet
// throughout their crossfade, including its placement and existing tilt.
export function applyPaperPose(element, current, placement) {
  const values = { ...current };
  if (placement) {
    values.scale *= placement.scale;
    for (const key of ['rx', 'ry', 'sy', 'blur', 'opacity']) values[key] += placement[key];
  }
  element.style.setProperty('--paper-placement-y', `${(placement?.y ?? 0).toFixed(4)}px`);
  for (const key of ['rx', 'ry']) element.style.setProperty(`--paper-${key}`, `${values[key].toFixed(4)}deg`);
  for (const key of ['sx', 'sy', 'blur']) element.style.setProperty(`--paper-${key}`, `${values[key].toFixed(4)}px`);
  element.style.setProperty('--paper-scale', values.scale.toFixed(5));
  element.style.setProperty('--paper-shadow-opacity', values.opacity.toFixed(4));
  return values;
}
