// The teaser's words (tools/resume/build.mjs): below the header, every letter
// and digit is swapped for another of its kind, the same way each build, so
// the teaser keeps the resume's look and says nothing. The name, the title,
// the contact lines (all on the card page too) and the section headings stay.
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = LOWER.toUpperCase();
const DIGITS = '0123456789';
// Paragraphs kept as they are; every other <p>, <h3>, <h4> and <li> is scrambled.
const KEPT = /^<p class="(title|contact)"/;

export function scrambleResume(html, seed = 20261108) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = set => set[Math.floor(random() * set.length)];
  const swap = char => (/[a-z]/.test(char) ? pick(LOWER) : /[A-Z]/.test(char) ? pick(UPPER) : /[0-9]/.test(char) ? pick(DIGITS) : char);
  // Text only: tags and entities pass through untouched.
  const scramble = inner => inner.replace(/(<[^>]*>|&#?\w+;)|([^<&]+)/g, (_, kept, text) => kept ?? [...text].map(swap).join(''));
  const start = html.indexOf('<body');
  return html.slice(0, start) + html.slice(start).replace(/<(p|h3|h4|li)\b[^>]*>[\s\S]*?<\/\1>/g, element => {
    if (KEPT.test(element)) return element;
    const open = element.indexOf('>') + 1, close = element.lastIndexOf('</');
    return element.slice(0, open) + scramble(element.slice(open, close)) + element.slice(close);
  });
}
