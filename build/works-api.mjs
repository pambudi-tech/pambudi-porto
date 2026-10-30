import { loadEnv } from 'vite';
import { PASS } from '../server/works-pass.mjs';
import unlock from '../api/unlock.js';
import gallery from '../api/gallery.js';
import workAsset from '../api/work-asset.js';
import pass from '../api/pass.js';

// The PIN pass's API (api/, served by Vercel in production) on the dev and
// preview servers, with WORKS_PIN and WORKS_SECRET read from .env.local.
//
// For testing the panel, WORKS_RESET_PASS=1 makes the dev server (only) drop
// the pass whenever a project page loads, so every refresh asks again.
const ROUTES = { '/api/unlock': unlock, '/api/gallery': gallery, '/api/work-asset': workAsset, '/api/pass': pass };

export function worksApi() {
  const serve = (request, response, next) => {
    const handler = ROUTES[request.url.split('?')[0]];
    if (!handler) return next();
    Promise.resolve(handler(request, response)).catch(next);
  };
  const env = mode => {
    for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), 'WORKS_'))) process.env[key] ??= value;
  };
  const resetPass = (request, response, next) => {
    if (process.env.WORKS_RESET_PASS === '1' && /^\/work(\.html|\/)/.test(request.url)) {
      response.setHeader('Set-Cookie', `${PASS.cookie}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
    }
    next();
  };
  return {
    name: 'works-api',
    configResolved: config => env(config.mode),
    configureServer: server => { server.middlewares.use(resetPass); server.middlewares.use(serve); },
    configurePreviewServer: server => { server.middlewares.use(serve); },
  };
}
