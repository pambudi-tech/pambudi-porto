// Mandalika GP's case study, drawn from the Medium case study on its website.
// The cover comes from its card in content/works.mjs.
export default {
  id: 'mandalika',
  title: 'Mandalika GP Website',
  category: 'Website · UI design',
  // No subtitle: the overview says it all.
  subtitle: '',
  overview: 'A race portal built from nothing, to the standard of the world’s great circuits: one compact navigation over tickets, schedules, standings and travel, a racing look grown from MGPA’s brand, and a consistent page system that let the site launch fast.',
  facts: {
    client: 'Mandalika Grand Prix Association',
    role: 'UI designer',
    period: 'May 2023 — Jul 2023',
    scope: 'Website design',
  },
  cover: { width: 1200, height: 900, title: 'The race portal', caption: 'Website design', alt: 'Mandalika GP website on a desktop monitor resting on a motorcycle wheel: the MotoGP riders standing, above the last session results, on a red gradient' },
  gallery: [
    { id: 'gallery-results', src: '/assets/works/mandalika-gallery-01.webp', width: 2000, height: 1500, alt: 'Mandalika GP “Last Session Results · MotoGP 2022” section on dark grey: cards for Miguel Oliveira, Fabio Quartararo and Johann Zarco, each with flag, team, time or gap and speed, and a #1 to #3 placing beside the rider’s portrait in his team colour' },
    { id: 'gallery-tickets', src: '/assets/works/mandalika-gallery-02.webp', width: 2000, height: 1500, alt: '“Find your best seat” on a yellow checkered backdrop: four ticket cards, General Admission from Rp250,000, Standard Grandstand from Rp650,000, Premium Grandstand from Rp1,000,000 and the VIP Hospitality Package from Rp10 million, each with a photo of its seats' },
    { id: 'gallery-map', src: '/assets/works/mandalika-gallery-03.webp', width: 2000, height: 1500, alt: 'Mandalika circuit seating map on dark grey: the track in red, grandstand zones A to K each in its own colour, the Premiere Class hospitality suites and Deluxe Class VIP villages by the main straight, and a north arrow' },
  ],
};
