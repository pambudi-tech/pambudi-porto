// The cards on the works index, in order.
//
// - `from` and `to` are months, 'YYYY-MM'; `to: null` is ongoing.
// - `tags` name what was made, on the stamp; `summary` is the project page's
//   subtitle.
// - `page: true` gives the card a project page at /work/<id>. A work with a
//   case study in content/projects/ shows it; the others borrow Ocean's
//   gallery as a stand-in until theirs is written.
// - `site` is a live address the project page links to, where there is one.
// - `passwordProtected` marks work behind a password.
// - Covers from Unsplash are temporary samples. Runrise and Rana are still
//   placeholders.
const unsplash = id => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&h=900&q=80`;

export const WORKS = [
  { id: 'bca-prioritas', title: 'bca prioritas', client: 'bank central asia', tags: ['website', 'art direction', 'prototype'],
    role: 'designer · contract', passwordProtected: true,
    summary: "a revamp of bca's private banking website, with a live prototype and design documentation.",
    from: '2026-05', to: '2026-09', page: true,
    image: unsplash('1557672172-298e090bd0f1'), alt: 'Sample cover: an abstract gradient' },
  { id: 'ocean', title: 'ocean by bca', client: 'bank central asia', tags: ['product design', 'design system'],
    role: 'product designer · embedded retainer',
    summary: "a new digital banking platform for bca's business customers.",
    from: '2024-07', to: '2026-05', page: true,
    image: unsplash('1625992865747-d814b125ab22'), alt: 'Ocean by BCA: aerial ocean waves and white foam' },
  { id: 'bca-co-id', title: 'bca.co.id', client: 'bank central asia', tags: ['ui design', 'prototype'],
    role: 'designer · contract', passwordProtected: true,
    summary: 'a live, testable prototype of a proposed bca.co.id, built for usability research.',
    from: '2026-05', to: '2026-09', page: true,
    image: unsplash('1563986768609-322da13575f3'), alt: 'Sample cover: someone using a banking app beside a laptop' },
  { id: 'runrise', title: 'runrise running club', client: 'runrise running club', tags: ['branding'],
    role: 'brand designer',
    summary: 'sample: a placeholder line for the running club.',
    from: '2026-01', to: null, page: true,
    image: unsplash('1461896836934-ffe607ba8211'), alt: 'Sample cover: a sprinter in the blocks on a red track' },
  { id: 'rana', title: 'rana graduation', client: 'rana', tags: ['website', 'interactive'],
    role: 'designer',
    summary: 'sample: a placeholder line for the interactive pricelist.',
    from: '2025-06', to: '2025-08', page: true,
    image: unsplash('1541701494587-cb58502866ab'), alt: 'Sample cover: an abstract paint study' },
  // Freelance via Panenmaya.
  { id: 'mandalika', title: 'mandalika gp', client: 'mandalika grand prix association', tags: ['website', 'ui design'],
    role: 'ui designer · freelance',
    summary: "the official portal for indonesia's motogp and wsbk races at mandalika, designed from scratch in three weeks.",
    from: '2023-05', to: '2023-07', page: true, site: 'https://themandalikagp.com',
    image: '/assets/works/mandalika.webp',
    alt: 'Mandalika GP website: the homepage hero for the Pertamina Grand Prix of Indonesia, above featured race events' },
];

// Exploration: personal studies and play, shown by the gallery's toggle.
// All samples for now; none has a page yet, so their cards do not open.
export const EXPLORATION = [
  { id: 'soft-forms', title: 'soft forms', client: 'personal', tags: ['3d study'], role: 'exploration',
    summary: 'sample: rounded shapes lit like fabric.',
    from: '2026-07', to: null, image: unsplash('1618005182384-a83a8bd57fbe'), alt: 'Sample cover: an abstract colour study' },
  { id: 'night-signal', title: 'night signal', client: 'personal', tags: ['light study'], role: 'exploration',
    summary: 'sample: neon light, long exposures.',
    from: '2025-12', to: '2026-02', image: unsplash('1550684376-efcbd6e3f031'), alt: 'Sample cover: an abstract light study' },
  { id: 'paint-drift', title: 'paint drift', client: 'personal', tags: ['colour study'], role: 'exploration',
    summary: 'sample: poured paint, read as a palette.',
    from: '2025-06', to: '2025-08', image: unsplash('1541701494587-cb58502866ab'), alt: 'Sample cover: an abstract paint study' },
  { id: 'gradient-weather', title: 'gradient weather', client: 'personal', tags: ['motion study'], role: 'exploration',
    summary: 'sample: gradients that move like the sky.',
    from: '2024-11', to: '2025-01', image: unsplash('1557672172-298e090bd0f1'), alt: 'Sample cover: an abstract gradient study' },
  { id: 'colour-field', title: 'colour field', client: 'personal', tags: ['type and colour'], role: 'exploration',
    summary: 'sample: one colour, many weights of type.',
    from: '2024-03', to: '2024-06', image: unsplash('1579546929518-9e396f3cc809'), alt: 'Sample cover: an abstract colour field' },
];
