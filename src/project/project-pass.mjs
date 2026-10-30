// The browser's side of the PIN pass (server/works-pass.mjs): the server
// checks the PIN and keeps the pass in a cookie this page cannot read, so the
// page only ever asks.

// A protected project's gallery if this visitor has a pass, else null.
export async function fetchGallery(id) {
  try {
    const response = await fetch(`/api/gallery?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    return response.ok ? (await response.json()).images : null;
  } catch {
    return null;
  }
}

// 'ok' for a right PIN, 'wrong' for a wrong one, 'error' when it could not be
// checked.
export async function unlock(pin) {
  try {
    const response = await fetch('/api/unlock', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }),
    });
    return response.ok ? 'ok' : response.status === 401 ? 'wrong' : 'error';
  } catch {
    return 'error';
  }
}
