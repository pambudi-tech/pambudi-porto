// Each page's own stylesheet goes inline, where its <link> was: the same
// rules, applied at the same point in the head, without a render-blocking
// request first. The file stays in /static for anything else that names it.
const LINK = /<link rel="stylesheet"(?: crossorigin)? href="\/(static\/[^"]+\.css)">/g;

export function inlineStyles() {
  return {
    name: 'inline-styles',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.html')) continue;
        file.source = String(file.source).replace(LINK, (link, name) => {
          const sheet = bundle[name];
          if (sheet?.type !== 'asset') return link;
          return `<style>${String(sheet.source).replaceAll('</style', '<\\/style')}</style>`;
        });
      }
    },
  };
}
