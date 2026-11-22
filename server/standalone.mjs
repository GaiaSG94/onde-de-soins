import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { handleOrsRequest } from './orsProxy.ts';

config();

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  if (req.url?.startsWith('/api/ors/')) {
    await handleOrsRequest(req, res);
    return;
  }
  const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, safe === '/' ? 'index.html' : safe);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const content = await readFile(file);
    res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    res.end(content);
  } catch {
    const html = await readFile(join(root, 'index.html')).catch(() => '<h1>Build manquant</h1>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  }
}).listen(port, () => {
  console.log(`Onde de soins : http://localhost:${port}`);
});
