// Local preview: serves public/ and the /api functions the way Vercel does.
// Without DATABASE_URL it keeps the waitlist in memory (SITE_DEV=1), and the admin password is "dev-password".
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SITE_DEV ??= '1';
if (!process.env.DATABASE_URL) {
  process.env.ADMIN_PASSWORD ??= 'dev-password';
  process.env.ADMIN_SECRET ??= 'dev-secret-dev-secret-dev-secret-0000';
}
const root = fileURLToPath(new URL('./public/', import.meta.url));
const api = { '/api/join': './api/join.js', '/api/access': './api/access.js', '/api/admin': './api/admin.js' };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.txt': 'text/plain', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (api[path]) {
    let raw = '';
    for await (const c of req) raw += c;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
    const { default: h } = await import(api[path]);
    return h(req, res);
  }
  let file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  if (!extname(file)) file = file.replace(/\/?$/, '') + (path.endsWith('/') ? '/index.html' : '.html');
  try {
    const data = await readFile(file).catch(() => readFile(file.replace(/\.html$/, '/index.html')));
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(Number(process.env.PORT || 4321), () => console.log(`site on http://localhost:${process.env.PORT || 4321}`));
