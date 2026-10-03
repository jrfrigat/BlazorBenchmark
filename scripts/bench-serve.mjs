// Static server for the picker bench: every response waits a fixed delay, so a request waterfall costs what it
// would on a real connection (localhost hides it), and a precompressed .br file is sent when the browser takes
// br, as a production host would. Caching is left to the browser's defaults - no no-store, which would erase the
// effect of preloads. Start one per cold run on a fresh port: a new origin is an empty cache.
//
//   node scripts/bench-serve.mjs <dir> <port> [delayMs=40]
import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const [dir, port, delayArg] = process.argv.slice(2);
if (!dir || !port) { console.error('usage: node bench-serve.mjs <dir> <port> [delayMs]'); process.exit(1); }
const root = resolve(dir);
const delay = Number(delayArg ?? 40);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.dll': 'application/octet-stream',
  '.dat': 'application/octet-stream', '.blat': 'application/octet-stream', '.pdb': 'application/octet-stream',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json',
};

async function file(path) {
  try { const s = await stat(path); return s.isFile() ? path : null; } catch { return null; }
}

createServer(async (req, res) => {
  await new Promise(r => setTimeout(r, delay));
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let path = normalize(join(root, url));
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  // A route of the single-page app falls back to its index.html.
  let found = await file(path) ?? (extname(url) ? null : await file(join(root, 'index.html')));
  if (!found) { res.writeHead(404).end(); return; }
  const headers = { 'Content-Type': types[extname(found)] ?? 'application/octet-stream', 'Vary': 'Accept-Encoding' };
  const br = (req.headers['accept-encoding'] ?? '').includes('br') ? await file(found + '.br') : null;
  if (br) headers['Content-Encoding'] = 'br';
  const body = await readFile(br ?? found);
  res.writeHead(200, headers).end(body);
}).listen(Number(port), () => console.log(`bench: ${root} on http://localhost:${port} (+${delay} ms)`));
