// Static server cho dist/ — zero dependency, dùng khi deploy dạng container/Node app
// (Mắt Bão App Platform, Docker, Passenger...). Deploy tĩnh thuần (upload dist/ lên
// httpdocs qua Plesk) thì KHÔNG cần file này.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webp': 'image/webp',
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    // Chặn path traversal
    let filePath = normalize(join(DIST, url));
    if (!filePath.startsWith(DIST)) filePath = join(DIST, 'index.html');

    let isFile = false;
    try { isFile = (await stat(filePath)).isFile(); } catch { /* not found */ }
    // SPA fallback: mọi path không phải file tĩnh đều trả index.html
    if (!isFile) filePath = join(DIST, 'index.html');

    const body = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      // Assets có hash trong tên → cache dài; index.html thì không cache
      'Cache-Control': url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Server error: ${err.message}`);
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Media Team App v2 — serving dist/ on http://0.0.0.0:${PORT}`);
});
