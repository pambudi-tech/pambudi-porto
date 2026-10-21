import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Publish browser files only. The local preview server must never become a
// production function, and development scripts/tests stay out of the output.
for (const entry of await readdir(root, { withFileTypes: true })) {
  const browserFile = entry.isFile()
    && /\.(html|css|mjs)$/.test(entry.name)
    && !entry.name.endsWith('.test.mjs')
    && entry.name !== 'server.mjs';
  const browserDirectory = entry.isDirectory()
    && ['assets', 'wax-study'].includes(entry.name);
  if (browserFile || browserDirectory) {
    await cp(path.join(root, entry.name), path.join(output, entry.name), { recursive: true });
  }
}

console.log('Static portfolio built in dist/ (no server functions).');
