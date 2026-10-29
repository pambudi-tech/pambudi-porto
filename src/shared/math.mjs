// Limits a value to a range, 0–1 unless another is given.
export const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
