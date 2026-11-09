import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { projectRoutes, siteHtml } from './build/site-html.mjs';
import { worksApi } from './build/works-api.mjs';
import { assetVersions } from './build/asset-versions.mjs';
import { inlineStyles } from './build/inline-styles.mjs';

const page = name => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  plugins: [siteHtml(), projectRoutes(), worksApi(), assetVersions(), inlineStyles()],
  server: { host: '127.0.0.1', port: 4317 },
  preview: { host: '127.0.0.1', port: 4317 },
  build: {
    // Hashed scripts and styles go to /static, apart from the stable image
    // and font URLs that public/assets serves at /assets.
    assetsDir: 'static',
    rolldownOptions: {
      // wax.html is a study for the dev server only, so it isn't built.
      input: { home: page('index.html'), surface: page('surface.html'), work: page('work.html'), card: page('card.html'), seal: page('seal.html'), 'p-seal': page('p-seal.html') },
    },
  },
});
