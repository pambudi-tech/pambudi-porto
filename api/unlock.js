import { PASS, checkPin, passCookie, readJson, send } from '../server/works-pass.mjs';

// POST { pin }: a right PIN sets the day-long pass cookie. A wrong one waits a
// moment before answering, to slow guessing.
export default async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { error: 'method' }, { Allow: 'POST' });
  let pin;
  try {
    ({ pin } = await readJson(request));
  } catch {
    return send(response, 400, { error: 'body' });
  }
  if (!process.env.WORKS_PIN || !process.env.WORKS_SECRET) return send(response, 503, { error: 'unconfigured' });
  if (!checkPin(pin)) {
    await new Promise(resolve => setTimeout(resolve, 700));
    return send(response, 401, { error: 'pin' });
  }
  send(response, 204, undefined, { 'Set-Cookie': passCookie(request), 'X-Pass-Seconds': String(PASS.seconds) });
}
