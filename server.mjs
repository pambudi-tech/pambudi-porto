import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!filename.startsWith(root) || !types[path.extname(filename)]) {
      res.writeHead(404).end('Not found');
      return;
    }
    const contentType = types[path.extname(filename)];
    res.writeHead(200, { 'Content-Type': contentType.startsWith('text/') ? `${contentType}; charset=utf-8` : contentType, 'Cache-Control': 'no-store' });
    res.end(await readFile(filename));
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.listen(Number(process.env.PORT || 4317), '127.0.0.1', () => {
  console.log(`Stitch surface: http://127.0.0.1:${server.address().port}`);
});
