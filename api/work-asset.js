import { hasPass, privateAsset, queryOf, send } from '../server/works-pass.mjs';

// GET ?path=<work>/<file>: one of a protected project's private images, for a
// visitor with a pass.
export default async function handler(request, response) {
  if (!hasPass(request)) return send(response, 401, { error: 'pass' });
  const asset = await privateAsset(queryOf(request).get('path'));
  if (!asset) return send(response, 404, { error: 'asset' });
  send(response, 200, asset.body, { 'Content-Type': asset.type });
}
