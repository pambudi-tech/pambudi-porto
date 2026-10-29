import { readFileSync } from 'node:fs';
import { SITE, contactHref } from '../content/site.mjs';

// Fills the pages' HTML from content/site.mjs and shared partials, in the dev
// server and the build alike, so the copy stays real HTML.
//
//   %site.title%, %site.description%   head text
//   <!-- site:paper-copy -->           introduction and contact icons
//   <!-- site:about -->                About Me on the back of the paper
//   <!-- partial:name -->              src/partials/name.html

const escape = text => String(text).replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
const capitalize = word => word[0].toUpperCase() + word.slice(1);
const firstName = SITE.name.split(' ')[0];
// Keeps each item on one line, so a list only wraps between items.
const items = list => list.map(item => escape(item).replaceAll(' ', '&nbsp;')).join('&nbsp;· ');

function indent(html, spaces) {
  return html.split('\n').map((line, index) => index && line ? ' '.repeat(spaces) + line : line).join('\n');
}

export function paperCopy() {
  const link = `<a class="intro-link" href="#about-me" aria-controls="about-me" aria-expanded="false" aria-label="${escape(firstName)}, about me" data-tooltip="about me">${escape(firstName)}</a>`;
  const paragraphs = SITE.intro.map(text => `<p>${escape(text).replace('{about}', link)}</p>`);
  const contacts = SITE.contacts.map(({ id, label, tooltip, icon, href }) => {
    const image = `  <img src="/assets/contact/${icon}" width="20" height="20" alt="" aria-hidden="true" draggable="false" />`;
    return id === 'email'
      ? `<button class="contact-link" type="button" aria-label="${escape(label)}" data-email="${escape(SITE.email)}" data-tooltip="${escape(tooltip)}">\n${image}\n</button>`
      : `<a class="contact-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(label)}" data-tooltip="${escape(tooltip)}">\n${image}\n</a>`;
  });
  return [
    ...paragraphs,
    '<div class="paper-contact" role="group" aria-label="Contact">',
    ...contacts.map(contact => indent(`  ${contact}`, 2)),
    '</div>',
  ].join('\n');
}

export function about() {
  const { experience, skillset, stack, profile, signature } = SITE.about;
  const contact = SITE.contacts.find(entry => entry.id === profile);
  return [
    '<header class="about-heading">',
    `  <h1 id="about-name">${escape(SITE.name)}</h1>`,
    `  <p>${escape(SITE.role)}</p>`,
    '</header>',
    '<section aria-labelledby="about-experience">',
    '  <h2 id="about-experience">experience</h2>',
    '  <ul class="about-list">',
    ...experience.map(({ company, period }) => `    <li class="about-row"><span>${escape(company)}</span><span class="about-detail">${escape(period)}</span></li>`),
    '  </ul>',
    '</section>',
    '<section aria-labelledby="about-skillset">',
    '  <h2 id="about-skillset">skillset</h2>',
    `  <p class="about-items">${items(skillset)}</p>`,
    '</section>',
    '<section aria-labelledby="about-stack">',
    '  <h2 id="about-stack">stack</h2>',
    `  <p class="about-items">${items(stack)}</p>`,
    '</section>',
    '<footer class="about-footer">',
    `  <a class="about-profile" href="${escape(contactHref(profile))}" target="_blank" rel="noopener noreferrer" aria-label="View ${escape(capitalize(firstName))}’s ${escape(contact.label)} profile"><span class="about-icon about-icon-${escape(profile)}" aria-hidden="true"></span><span>${escape(contact.tooltip)}</span></a>`,
    `  <img class="about-signature" src="${escape(signature.src)}" width="${signature.width}" height="${signature.height}" alt="${escape(signature.alt)}" draggable="false" />`,
    '</footer>',
  ].join('\n');
}

export function fillHtml(html, { root }) {
  return html
    .replaceAll('%site.title%', escape(SITE.title))
    .replaceAll('%site.description%', escape(SITE.description))
    .replace(/^([ \t]*)<!-- site:(paper-copy|about) -->/gm, (_, space, name) => indent(space + (name === 'about' ? about() : paperCopy()), space.length))
    .replace(/^([ \t]*)<!-- partial:([\w-]+) -->/gm, (_, space, name) => indent(space + readFileSync(new URL(`src/partials/${name}.html`, root), 'utf8').trimEnd(), space.length));
}

export function siteHtml() {
  const root = new URL('../', import.meta.url);
  return {
    name: 'site-html',
    transformIndexHtml: { order: 'pre', handler: html => fillHtml(html, { root }) },
  };
}

// /work/<id> is one template, work.html, filled in the browser.
export function projectRoutes() {
  const rewrite = (request, _response, next) => {
    const [path, query] = request.url.split('?');
    if (/^\/work\/[^/.]+\/?$/.test(path)) request.url = `/work.html${query ? `?${query}` : ''}`;
    next();
  };
  return {
    name: 'project-routes',
    configureServer: server => { server.middlewares.use(rewrite); },
    configurePreviewServer: server => { server.middlewares.use(rewrite); },
  };
}
