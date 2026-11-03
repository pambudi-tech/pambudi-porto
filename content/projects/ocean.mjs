// Ocean's case study, drawn from the supplied LinkedIn description. The cover
// comes from its card in content/works.mjs.
//
// A new case study is a file like this one, named after its work's id and
// listed in content/projects/index.mjs.
export default {
  id: 'ocean',
  title: 'Ocean by BCA',
  category: 'Product design · Design systems',
  subtitle: 'Embedded as a product design retainer for Ocean by BCA, a new digital banking platform for business customers.',
  overview: 'Worked across design systems, product design, and visual direction—from establishing a deep-blue, dark glassmorphism aesthetic to redesigning the homepage and defining onboarding forms.',
  facts: {
    client: 'Bank Central Asia',
    role: 'Designer · Embedded retainer',
    period: 'Jul 2024 — May 2026',
    scope: 'Design systems, product design & visual direction',
  },
  cover: { width: 1200, height: 900, title: 'The homepage revamp', caption: 'Visual design & interactive prototype', alt: 'Ocean by BCA website: the homepage hero, “Kolaborasi. Inovasi. Ekspansi.”, above a photo of fishermen casting a net at sunset' },
  gallery: [
    { id: 'gallery-why-ocean', src: '/assets/works/ocean-gallery-01.webp', width: 2000, height: 1500, alt: 'Ocean by BCA “Mengapa Ocean by BCA” section: “Membangun Ekosistem Bisnis Potensial dan Berkelanjutan” over an offshore platform at dusk, with three frosted-glass stat cards: 33 million customers, 13.8% credit growth and 99.8% digital transactions' },
    { id: 'gallery-icons', src: '/assets/works/ocean-gallery-02.webp', width: 2000, height: 1500, alt: 'Ocean by BCA illustrated icons in deep blue and teal on a white grid: insurance, savings, smart search, OTP, application sent and wealth' },
    { id: 'gallery-components', src: '/assets/works/ocean-gallery-03.webp', width: 2000, height: 1500, alt: 'Ocean by BCA form components on a white card over a blue gradient: an info banner, OTP digits, file-format chips, a quantity stepper, feature checkboxes, a 2FA toggle, an e-statement button, an EDC application status card, an NPWP upload area and a business-field dropdown' },
  ],
};
