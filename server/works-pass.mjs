// The one PIN for password-protected work, checked here on the server, never
// in the page. A right PIN earns a pass: a signed cookie that opens every
// protected project for a day. A protected project's gallery and its private
// images are only ever served to a visitor holding one.
//
// Set on the host (and in .env.local for the dev server):
//   WORKS_PIN     the six digits visitors are given by email
//   WORKS_SECRET  a long random string that signs the passes

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import { WORKS } from '../content/works.mjs';
import { PROJECTS, STAND_IN } from '../content/projects/index.mjs';

export const PASS = Object.freeze({ cookie: 'works_pass', seconds: 24 * 60 * 60, digits: 6 });

// A protected project's own gallery: private/works/<id>/gallery.json, a list
// like a case study's `gallery` whose `src` names a file beside it.
const PRIVATE = join(process.cwd(), 'private', 'works');
const TYPES = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.avif': 'image/avif' };

const configured = () => /^\d{6}$/.test(process.env.WORKS_PIN ?? '') && (process.env.WORKS_SECRET ?? '').length >= 16;
const sign = expires => createHmac('sha256', process.env.WORKS_SECRET).update(`works:${expires}`).digest('base64url');
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const isProtected = id => WORKS.some(work => work.id === id && work.page && work.passwordProtected);

export function checkPin(pin) {
  return configured() && typeof pin === 'string' && same(pin, process.env.WORKS_PIN);
}

// The cookie that carries a fresh pass. Secure everywhere but the dev server.
export function passCookie(request) {
  const expires = Math.floor(Date.now() / 1000) + PASS.seconds;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(request.headers.host ?? '');
  return `${PASS.cookie}=${expires}.${sign(expires)}; Max-Age=${PASS.seconds}; Path=/; HttpOnly; SameSite=Lax${local ? '' : '; Secure'}`;
}

export function hasPass(request) {
  if (!configured()) return false;
  const value = (request.headers.cookie ?? '').split(/;\s*/).find(part => part.startsWith(`${PASS.cookie}=`))?.slice(PASS.cookie.length + 1);
  const [expires, signature] = value?.split('.') ?? [];
  return Boolean(signature) && Number(expires) > Date.now() / 1000 && same(signature, sign(expires));
}

// The gallery a pass opens: the project's private one, or until it has one,
// the stand-in case study's.
export async function galleryOf(id) {
  try {
    const items = JSON.parse(await readFile(join(PRIVATE, id, 'gallery.json'), 'utf8'));
    return items.map(item => ({ ...item, src: `/api/work-asset?path=${encodeURIComponent(`${id}/${item.src}`)}` }));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return PROJECTS[STAND_IN].gallery;
  }
}

// A private image by its path under private/works/, or null.
export async function privateAsset(path) {
  const file = normalize(join(PRIVATE, String(path)));
  const type = TYPES[file.slice(file.lastIndexOf('.')).toLowerCase()];
  const [id] = file.slice(PRIVATE.length + 1).split(sep);
  if (!file.startsWith(PRIVATE + sep) || !type || !isProtected(id)) return null;
  try {
    return { body: await readFile(file), type };
  } catch {
    return null;
  }
}

// What the handlers share, on Vercel and the dev server alike.
export function send(response, status, body, headers = {}) {
  response.statusCode = status;
  for (const [name, value] of Object.entries({ 'Cache-Control': 'private, no-store', ...headers })) response.setHeader(name, value);
  if (body === undefined) return response.end();
  if (Buffer.isBuffer(body)) return response.end(body);
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

export async function readJson(request) {
  if (request.body !== undefined) return typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body;
  let text = '';
  for await (const chunk of request) text += chunk;
  return JSON.parse(text || '{}');
}

export const queryOf = request => new URL(request.url, 'http://localhost').searchParams;
