// A plain static file server (no framework, no API logic) for serving this
// repo's root during browser tests — satisfies the "runs client-side with no
// backend" requirement, since this is equivalent to any static host (GitHub
// Pages, S3, a CDN) and does nothing dynamic.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
};

export function startStaticServer(port = 0) {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const filePath = path.join(ROOT, urlPath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      const st = await stat(filePath);
      if (!st.isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const ext = path.extname(filePath);
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: boundPort } = server.address();
      resolve({ server, url: `http://127.0.0.1:${boundPort}` });
    });
  });
}
