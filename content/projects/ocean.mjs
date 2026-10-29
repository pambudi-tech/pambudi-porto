// Ocean's case study, drawn from the supplied LinkedIn description. The cover
// comes from its card in content/works.mjs; the Unsplash gallery photos are
// temporary layout samples.
//
// A new case study is a file like this one, named after its work's id and
// listed in content/projects/index.mjs.
export default {
  id: 'ocean',
  title: 'Ocean by BCA',
  category: 'Product design · Design systems',
  subtitle: 'Embedded as a product design retainer for a new digital banking platform for business customers.',
  overview: 'My work spanned design systems, product design, and visual direction—from establishing a deep-blue, dark glassmorphism aesthetic to redesigning the homepage and defining onboarding forms.',
  facts: {
    client: 'Bank Central Asia',
    role: 'Designer · Embedded retainer',
    period: 'Jul 2024 — May 2026',
    scope: 'Design systems, product design & visual direction',
  },
  cover: { width: 1200, height: 900, title: 'The homepage revamp', caption: 'Visual design & interactive prototype', alt: 'Temporary Unsplash photo of aerial ocean waves and white foam' },
  gallery: [
    { id: 'gallery-ocean', src: 'https://images.unsplash.com/photo-1735300022510-9ed02ca92f39?auto=format&fit=crop&w=1600&h=1000&q=85', width: 1600, height: 1000, layout: 'wide', accent: 'curl', corner: 'top-right', alt: 'Temporary Unsplash photo of a breaking blue ocean wave' },
    { id: 'gallery-surf', src: 'https://images.unsplash.com/photo-1651742740055-a4b4ff765225?auto=format&fit=crop&w=1200&h=900&q=85', width: 1200, height: 900, accent: 'flower', corner: 'top-left', alt: 'Temporary Unsplash photo of teal water and foamy surf' },
    { id: 'gallery-water', src: 'https://images.unsplash.com/photo-1641994396897-d8ab8d17b24e?auto=format&fit=crop&w=1200&h=900&q=85', width: 1200, height: 900, accent: 'curl', corner: 'bottom-right', alt: 'Temporary Unsplash photo of rippling deep-blue water' },
    { id: 'gallery-coast', src: 'https://images.unsplash.com/photo-1611794469140-f93afd4b3ed0?auto=format&fit=crop&w=1600&h=900&q=85', width: 1600, height: 900, layout: 'wide', accent: 'flower', corner: 'bottom-left', alt: 'Temporary Unsplash photo of waves reaching the shore' },
  ],
};
