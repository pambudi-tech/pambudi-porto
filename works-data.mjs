// Sample works for the gallery, and sample exploration beside them. Only Ocean has a real project page; the
// samples open it too, as a stand-in, and use temporary Unsplash covers. Dates are decimal years: 2024.5 is July 2024.
// `end: null` is ongoing. `passwordProtected` marks work behind a password
// (sample flags for now). Roles and summaries are placeholders too, except Ocean's.
const unsplash = id => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&h=720&q=80`;

export const WORKS = [
  { id: 'ocean', title: 'ocean by bca', client: 'bank central asia', field: 'product · design system', role: 'product designer · embedded retainer',
    summary: 'a deep-blue digital bank for business customers, from design system to homepage.',
    start: 2024.5, end: 2026.33,
    href: './ocean.html', image: unsplash('1625992865747-d814b125ab22'), alt: 'Ocean by BCA: aerial ocean waves and white foam' },
  { id: 'matchday', title: 'matchday', client: 'self-initiated', field: 'sports brand', role: 'brand designer',
    summary: 'sample: an identity for a football club that never sits still.',
    start: 2025.75, end: null,
    href: './ocean.html', image: unsplash('1461896836934-ffe607ba8211'), alt: 'Sample cover: a sprinter in the blocks on a red track' },
  { id: 'natuno', title: 'natuno', client: 'banking clients', field: 'product design', role: 'product designer · contract',
    summary: 'sample: banking flows for clients that stay unnamed.',
    passwordProtected: true, start: 2026.33, end: 2026.67,
    href: './ocean.html', image: unsplash('1563986768609-322da13575f3'), alt: 'Sample cover: someone using a banking app beside a laptop' },
  { id: 'harbour', title: 'harbour roast', client: 'a coffee roaster', field: 'brand identity', role: 'brand designer',
    summary: 'sample: packaging and type for a small-batch coffee roaster.',
    start: 2023.17, end: 2023.75,
    href: './ocean.html', image: unsplash('1495474472287-4d71bcdd2085'), alt: 'Sample cover: hands holding cups of latte art' },
  { id: 'cargo', title: 'cargo lane', client: 'a logistics startup', field: 'product design', role: 'product designer',
    summary: 'sample: tracking dashboards for a logistics startup.',
    passwordProtected: true, start: 2022.33, end: 2023.42,
    href: './ocean.html', image: unsplash('1586528116311-ad8dd3c8310d'), alt: 'Sample cover: a warehouse stacked with yellow parcels' },
];

// Exploration: personal studies and play, shown by the gallery's toggle.
// All samples for now; none has a page yet, so their cards do not open.
export const EXPLORATION = [
  { id: 'soft-forms', title: 'soft forms', client: 'personal', field: '3d study', role: 'exploration',
    summary: 'sample: rounded shapes lit like fabric.',
    start: 2026.5, end: null, image: unsplash('1618005182384-a83a8bd57fbe'), alt: 'Sample cover: an abstract colour study' },
  { id: 'night-signal', title: 'night signal', client: 'personal', field: 'light study', role: 'exploration',
    summary: 'sample: neon light, long exposures.',
    start: 2025.9, end: 2026.1, image: unsplash('1550684376-efcbd6e3f031'), alt: 'Sample cover: an abstract light study' },
  { id: 'paint-drift', title: 'paint drift', client: 'personal', field: 'colour study', role: 'exploration',
    summary: 'sample: poured paint, read as a palette.',
    start: 2025.4, end: 2025.6, image: unsplash('1541701494587-cb58502866ab'), alt: 'Sample cover: an abstract paint study' },
  { id: 'gradient-weather', title: 'gradient weather', client: 'personal', field: 'motion study', role: 'exploration',
    summary: 'sample: gradients that move like the sky.',
    start: 2024.8, end: 2025.0, image: unsplash('1557672172-298e090bd0f1'), alt: 'Sample cover: an abstract gradient study' },
  { id: 'colour-field', title: 'colour field', client: 'personal', field: 'type and colour', role: 'exploration',
    summary: 'sample: one colour, many weights of type.',
    start: 2024.2, end: 2024.4, image: unsplash('1579546929518-9e396f3cc809'), alt: 'Sample cover: an abstract colour field' },
];
