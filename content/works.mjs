// The works on the index. Ocean is the only one with a real project page; the
// others open it too, as a stand-in, and use temporary Unsplash covers. Dates
// are decimal years: 2024.5 is July 2024. `end: null` is ongoing. `tags` name
// what was made, on the stamp; `summary` is the project page's subtitle.
// `site` is a live address the project page links to, where there is one.
// `passwordProtected` marks work behind a password. Runrise and Rana are
// still placeholders.
const unsplash = id => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&h=900&q=80`;

export const WORKS = [
  { id: 'ocean', title: 'ocean by bca', client: 'bank central asia', tags: ['product design', 'design system'],
    role: 'product designer · embedded retainer',
    summary: "a new digital banking platform for bca's business customers.",
    start: 2024.5, end: 2026.33,
    href: './ocean.html', image: unsplash('1625992865747-d814b125ab22'), alt: 'Ocean by BCA: aerial ocean waves and white foam' },
  { id: 'bca-co-id', title: 'bca.co.id', client: 'bank central asia', tags: ['ui design', 'prototype'],
    role: 'designer · contract', passwordProtected: true,
    summary: 'a live, testable prototype of a proposed bca.co.id, built for usability research.',
    start: 2026.33, end: 2026.67,
    href: './ocean.html', image: unsplash('1563986768609-322da13575f3'), alt: 'Sample cover: someone using a banking app beside a laptop' },
  { id: 'bca-prioritas', title: 'bca prioritas', client: 'bank central asia', tags: ['website', 'art direction', 'prototype'],
    role: 'designer · contract', passwordProtected: true,
    summary: "a revamp of bca's private banking website, with a live prototype and design documentation.",
    start: 2026.33, end: 2026.67,
    href: './ocean.html', image: unsplash('1557672172-298e090bd0f1'), alt: 'Sample cover: an abstract gradient' },
  { id: 'runrise', title: 'runrise running club', client: 'runrise running club', tags: ['branding'],
    role: 'brand designer',
    summary: 'sample: a placeholder line for the running club.',
    start: 2025.75, end: null,
    href: './ocean.html', image: unsplash('1461896836934-ffe607ba8211'), alt: 'Sample cover: a sprinter in the blocks on a red track' },
  { id: 'rana', title: 'rana graduation', client: 'rana', tags: ['website', 'interactive'],
    role: 'designer',
    summary: 'sample: a placeholder line for the interactive pricelist.',
    start: 2025.4, end: 2025.6,
    href: './ocean.html', image: unsplash('1541701494587-cb58502866ab'), alt: 'Sample cover: an abstract paint study' },
  // Freelance via Panenmaya; the cover is the case study's own image on Medium,
  // used until it is hosted here.
  { id: 'mandalika', title: 'mandalika gp', client: 'mandalika grand prix association', tags: ['website', 'ui design'],
    role: 'ui designer · freelance',
    summary: "the official portal for indonesia's motogp and wsbk races at mandalika, designed from scratch in three weeks.",
    start: 2023.33, end: 2023.5,
    href: './ocean.html', site: 'https://themandalikagp.com', image: 'https://miro.medium.com/v2/resize:fit:1200/1*3PZ0H5jhYydNxjZmIKCQOg.png',
    alt: 'Mandalika GP website: the homepage hero for the Pertamina Grand Prix of Indonesia, above featured race events' },
];

// Exploration: personal studies and play, shown by the gallery's toggle.
// All samples for now; none has a page yet, so their cards do not open.
export const EXPLORATION = [
  { id: 'soft-forms', title: 'soft forms', client: 'personal', tags: ['3d study'], role: 'exploration',
    summary: 'sample: rounded shapes lit like fabric.',
    start: 2026.5, end: null, image: unsplash('1618005182384-a83a8bd57fbe'), alt: 'Sample cover: an abstract colour study' },
  { id: 'night-signal', title: 'night signal', client: 'personal', tags: ['light study'], role: 'exploration',
    summary: 'sample: neon light, long exposures.',
    start: 2025.9, end: 2026.1, image: unsplash('1550684376-efcbd6e3f031'), alt: 'Sample cover: an abstract light study' },
  { id: 'paint-drift', title: 'paint drift', client: 'personal', tags: ['colour study'], role: 'exploration',
    summary: 'sample: poured paint, read as a palette.',
    start: 2025.4, end: 2025.6, image: unsplash('1541701494587-cb58502866ab'), alt: 'Sample cover: an abstract paint study' },
  { id: 'gradient-weather', title: 'gradient weather', client: 'personal', tags: ['motion study'], role: 'exploration',
    summary: 'sample: gradients that move like the sky.',
    start: 2024.8, end: 2025.0, image: unsplash('1557672172-298e090bd0f1'), alt: 'Sample cover: an abstract gradient study' },
  { id: 'colour-field', title: 'colour field', client: 'personal', tags: ['type and colour'], role: 'exploration',
    summary: 'sample: one colour, many weights of type.',
    start: 2024.2, end: 2024.4, image: unsplash('1579546929518-9e396f3cc809'), alt: 'Sample cover: an abstract colour field' },
];
