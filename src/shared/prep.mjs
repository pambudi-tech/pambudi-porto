// Runs a preparation job (prep-worker.mjs) off the main thread. `fallback`
// is the same work done here, used when workers are unavailable or the job
// fails, so the result never depends on which side made it.
let worker;
let sequence = 0;
const pending = new Map();

function connect() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./prep-worker.mjs', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data: { id, result, error } }) => {
      const job = pending.get(id);
      pending.delete(id);
      if (error === undefined) job?.resolve(result);
      else job?.fail(error);
    });
    // A worker that cannot start fails every job it holds, and the page does
    // the work itself from then on.
    worker.addEventListener('error', () => {
      worker = null;
      for (const job of pending.values()) job.fail();
      pending.clear();
    });
  } catch {
    worker = null;
  }
  return worker;
}

export function offMainThread(type, payload, fallback = () => undefined) {
  const target = connect();
  if (!target) return Promise.resolve().then(fallback);
  return new Promise(resolve => {
    const id = ++sequence;
    pending.set(id, { resolve, fail: () => resolve(Promise.resolve().then(fallback)) });
    target.postMessage({ id, type, payload });
  });
}
