// Tiny zero-dependency static server for the study guides.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Load and pre-compress every file once at startup.
const files = new Map();
for (const name of fs.readdirSync(ROOT)) {
  const full = path.join(ROOT, name);
  if (!fs.statSync(full).isFile()) continue;
  const body = fs.readFileSync(full);
  const type = TYPES[path.extname(name)] || 'application/octet-stream';
  files.set('/' + name, { body, gz: zlib.gzipSync(body), type });
}

function resolve(urlPath) {
  if (urlPath === '/' || urlPath === '') return '/index.html';
  const clean = urlPath.replace(/\/+$/, '');
  if (files.has(clean)) return clean;
  if (files.has(clean + '.html')) return clean + '.html'; // /ai -> /ai.html
  return null;
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); return res.end('Bad request'); }

  const key = resolve(pathname);
  if (!key) {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }
  const f = files.get(key);
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const headers = {
    'Content-Type': f.type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept-Encoding',
  };
  if (gzip) headers['Content-Encoding'] = 'gzip';
  const body = gzip ? f.gz : f.body;
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(PORT, () => console.log(`Study guides on port ${PORT}`));
