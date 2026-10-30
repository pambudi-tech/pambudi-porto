import { galleryOf, hasPass, isProtected, queryOf, send } from '../server/works-pass.mjs';

// GET ?id=<work>: a protected project's gallery, for a visitor with a pass.
export default async function handler(request, response) {
  const id = queryOf(request).get('id');
  if (!isProtected(id)) return send(response, 404, { error: 'work' });
  if (!hasPass(request)) return send(response, 401, { error: 'pass' });
  send(response, 200, { images: await galleryOf(id) });
}
