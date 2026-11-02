import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

// public/assets keeps stable URLs (/assets/...), so on its own it can only be
// cached briefly. In a build, every reference the site makes to one of those
// files gains its content hash, /assets/x.webp?v=<hash>, and vercel.json
// caches versioned URLs for a year. A changed file gets a new URL; the
// scripts and styles that name it change too, so their own hashed names do.
//
// Left as they are: the social preview image, whose URL other sites keep,
// and any path the page builds at runtime rather than names in full.
const UNVERSIONED = new Set(['/assets/opengraph.jpg']);
const ASSET = /\/assets\/[\w./-]+?\.(?:webp|png|jpe?g|svg|woff2|avif|gif)(?![\w?])/g;

export function versionAssets(code, publicDir) {
  const versions = new Map();
  return code.replace(ASSET, url => {
    if (UNVERSIONED.has(url)) return url;
    if (!versions.has(url)) {
      const file = new URL(`.${url}`, publicDir);
      versions.set(url, existsSync(file)
        ? createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10) : null);
    }
    const version = versions.get(url);
    return version ? `${url}?v=${version}` : url;
  });
}

export function assetVersions() {
  const publicDir = new URL('../public/', import.meta.url);
  const script = id => !id.includes('/node_modules/') && /\.(?:mjs|js)$/.test(id.split('?')[0]);
  return {
    name: 'asset-versions',
    apply: 'build',
    enforce: 'post',
    // Stylesheets are versioned by PostCSS once their @imports are inlined,
    // before they are hashed.
    config: () => ({
      css: { postcss: { plugins: [{
        postcssPlugin: 'asset-versions',
        Declaration(declaration) {
          if (declaration.value.includes('/assets/')) declaration.value = versionAssets(declaration.value, publicDir);
        },
      }] } },
    }),
    // Scripts before bundling, so each one's hashed name covers its versions.
    transform(code, id) {
      if (!script(id) || !code.includes('/assets/')) return null;
      return { code: versionAssets(code, publicDir), map: null };
    },
    // Pages last, after Vite has rewritten their src and srcset URLs.
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.html')) file.source = versionAssets(String(file.source), publicDir);
      }
    },
  };
}
