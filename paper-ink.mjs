import { createInkLayer } from './ink-growth.mjs';

export const INK_ENTRANCE = { delay: 180, duration: 4200 };

export async function paperInkEntrance(copy, { motionPreference } = {}) {
  if (!copy) return;
  const layers = [];
  let frame;
  const finish = () => {
    cancelAnimationFrame(frame);
    copy.classList.remove('ink-preparing', 'ink-bloom');
    for (const layer of layers) { layer.canvas.remove(); layer.soak.remove(); }
    copy.style.removeProperty('--ink-duration');
    copy.style.removeProperty('--ink-delay');
    copy.dataset.inkState = 'complete';
    motionPreference?.removeEventListener('change', onPreference);
    window.removeEventListener('resize', finish);
  };
  const onPreference = event => { if (event.matches) finish(); };
  if (motionPreference?.matches) { finish(); return; }
  copy.dataset.inkState = 'preparing';
  copy.classList.add('ink-preparing');
  motionPreference?.addEventListener('change', onPreference);
  window.addEventListener('resize', finish, { once: true });
  try {
    const image = copy.closest('.portfolio-paper')?.querySelector('img');
    await Promise.all([document.fonts.ready, image?.decode().catch(() => {})]);
    if (copy.dataset.inkState === 'complete') return;
    for (const paragraph of copy.querySelectorAll('p')) layers.push(createInkLayer(paragraph));
    copy.style.setProperty('--ink-duration', `${INK_ENTRANCE.duration}ms`);
    copy.style.setProperty('--ink-delay', `${INK_ENTRANCE.delay}ms`);
    copy.classList.replace('ink-preparing', 'ink-bloom');
    copy.dataset.inkState = 'blooming';
    const started = performance.now() + INK_ENTRANCE.delay;
    const draw = now => {
      const progress = Math.max(0, Math.min(1, (now - started) / INK_ENTRANCE.duration));
      for (const layer of layers) layer.draw(progress);
      if (progress >= 1) finish();
      else frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
  } catch {
    // Keep the introduction readable if enhancement or font loading fails.
    finish();
  }
}
