import { hasPass, send } from '../server/works-pass.mjs';

// GET: { passed }, whether this visitor holds a pass. The works row asks, to
// show protected work's covers as previews until then.
export default function handler(request, response) {
  send(response, 200, { passed: hasPass(request) });
}
