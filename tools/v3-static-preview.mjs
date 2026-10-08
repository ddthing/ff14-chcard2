import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('out');
const port = Number(process.argv[2] || 4319);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer(async (request, response) => {
  try {
    const route = decodeURIComponent(new URL(request.url || '/', `http://127.0.0.1:${port}`).pathname);
    const target = path.resolve(root, `.${route}`);
    if (target !== root && !target.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    const candidates = route.endsWith('/') ? [path.join(target, 'index.html')] : [target, target + '.html', path.join(target, 'index.html')];
    for (const candidate of candidates) {
      try {
        if (!(await stat(candidate)).isFile()) continue;
        const bytes = await readFile(candidate);
        const cacheControl = route.startsWith('/_next/static/')
          ? 'public, max-age=31536000, immutable'
          : 'no-store';
        response.writeHead(200, { 'content-type': mime[path.extname(candidate)] || 'application/octet-stream', 'cache-control': cacheControl });
        response.end(request.method === 'HEAD' ? undefined : bytes);
        return;
      } catch { /* Try the next static-export candidate. */ }
    }
    response.writeHead(404).end('Not found');
  } catch {
    response.writeHead(400).end('Invalid request');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`V3 preview: http://127.0.0.1:${port}`));
