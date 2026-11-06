// Who Ivan is, how to reach him, and the About Me on the back of the paper.
// The pages are filled from this file at build time (see build/site-html.mjs),
// so the text stays in the HTML for search engines and for visitors without
// JavaScript.

export const SITE = {
  name: 'ivan pambudi',
  role: 'ui & brand designer',
  title: 'Ivan Pambudi - The Portfolio',
  description: 'House of selected works & exploration by Ivan Pambudi',
  // Link previews need absolute URLs. The image is 1200×630
  // (master: tools/source-images/opengraph.webp).
  url: 'https://pambudi.xyz',
  image: { src: '/assets/opengraph.jpg', width: 1200, height: 630, alt: 'ui & brand designer, on embossed paper below the PAMBUDI wordmark' },
  email: 'ivan@pambudi.xyz',

  // The introduction on the front of the paper. `{about}` is the red "ivan"
  // link that turns the paper over to About Me.
  intro: [
    'as a designer, {about} gets invested in a project as if he were its co-founder. he hates bad details as much as he hates the regime.',
    'mostly corporate work lately, but after hours he teams up with ai to bring his visions to life, one stitch at a time (pun intended)',
  ],

  // In the order the icons appear below the introduction. `icon` names a file
  // in public/assets/contact/.
  contacts: [
    { id: 'email', label: 'Copy email address', tooltip: 'copy email', icon: 'email.svg' },
    { id: 'linkedin', label: 'LinkedIn', tooltip: 'linkedin', icon: 'linkedin.svg', href: 'https://linkedin.com/in/pambudixix' },
    { id: 'x', label: 'X', tooltip: 'x', icon: 'x.svg', href: 'https://x.com/____pambudi' },
    { id: 'instagram', label: 'Instagram', tooltip: 'instagram', icon: 'instagram.svg', href: 'https://instagram.com/____pambudi' },
    { id: 'behance', label: 'Behance', tooltip: 'behance', icon: 'behance.svg', href: 'https://behance.net/pambudi' },
  ],

  about: {
    experience: [
      { company: 'natuno', period: 'may–sep 2026' },
      { company: 'bca', period: 'jul 2024–may 2026' },
    ],
    skillset: ['ui design', 'branding', 'art direction', 'design systems', 'prototyping'],
    stack: ['figma', 'illustrator', 'claude', 'github', 'vercel'],
    // The profile linked beside the signature, by contact id.
    profile: 'linkedin',
    signature: { src: '/assets/ivan-signature.webp', srcset: '/assets/ivan-signature-320w.webp 320w, /assets/ivan-signature.webp 640w', sizes: '160px', width: 640, height: 371, alt: 'Ivan Pambudi’s signature' },
  },

  // The homepage's hidden extra: pull the page down past its top and this
  // shows on red above it (src/colophon/). A row per part of the site.
  colophon: {
    title: 'about this porto',
    rows: [
      ['built', '2026, by ivan, with claude'],
      ['type', 'syne mono'],
      ['paper', 'modelled in blender, relit live in webgl, no engine'],
      ['seal', 'wax poured in blender, lit by the paper’s own lamp'],
      ['cloth', 'every stitch on a grid; tap it to add yours'],
      ['dove', 'flies on its own, rests on the corners when you do'],
      ['clock', 'your local time, in dots'],
      ['stack', 'vite, plain javascript, vercel'],
    ],
    note: 'you pulled past the top. nothing else up here, thanks for looking.',
  },
};

export const contactHref = id => SITE.contacts.find(contact => contact.id === id)?.href;
