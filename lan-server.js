#!/usr/bin/env node
/**
 * Zero-dependency LAN static server for this demo.
 * Run through start-lan-server.bat on Windows.
 * Optional live reload: enabled by default (DISABLE_LIVE_RELOAD=1 to turn off).
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computeContentId } = require('./tools/content-id.cjs');
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(projectRoot, 'src');
const port = Number(process.env.PORT || process.argv[2] || 8080);
const liveReload = process.env.DISABLE_LIVE_RELOAD !== '1';
const debugRecDir = path.join(projectRoot, '.debug-rec');
let cachedContentId = null;

function getContentId() {
  if (!cachedContentId) cachedContentId = computeContentId(projectRoot);
  return cachedContentId;
}

function buildIdPayload() {
  return {
    ok: true,
    id: getContentId(),
    at: new Date().toISOString(),
    source: 'lan'
  };
}
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

const LIVE_RELOAD_CLIENT = `(() => {
  const source = new EventSource('/__livereload');
  source.onmessage = () => {
    source.close();
    location.reload();
  };
  source.onerror = () => {
    // Keep the EventSource; browser retries. Useful when the PC server restarts.
  };
})();`;

const reloadClients = new Set();
const watchIgnore = new Set(['android', 'node_modules', 'www', '.git', 'dist', '.cursor']);

function sendHeaders(response, statusCode, headers = {}) {
  response.writeHead(statusCode, { ...noCacheHeaders, ...headers });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && item.family === 'IPv4' && !item.internal)
    .map(item => item.address);
}

function broadcastReload() {
  for (const client of reloadClients) {
    try {
      client.write('data: reload\n\n');
    } catch {
      reloadClients.delete(client);
    }
  }
}

function injectLiveReload(htmlBuffer) {
  const html = htmlBuffer.toString('utf8');
  if (html.includes('/__livereload.js')) return Buffer.from(html, 'utf8');
  if (/<\/body>/i.test(html)) {
    return Buffer.from(html.replace(/<\/body>/i, '<script src="/__livereload.js"></script></body>'), 'utf8');
  }
  return Buffer.from(`${html}\n<script src="/__livereload.js"></script>\n`, 'utf8');
}

function injectBuildStamp(htmlBuffer) {
  const id = getContentId();
  if (!id) return htmlBuffer;
  const html = htmlBuffer.toString('utf8');
  if (!html.includes('id="menuDrawerBuild"')) return htmlBuffer;
  const next = html.replace(
    /(<div\b[^>]*\bid="menuDrawerBuild"[^>]*>)[\s\S]*?(<\/div>)/i,
    `$1版本 ${id}$2`
  );
  return Buffer.from(next, 'utf8');
}

function startWatchers() {
  const targets = ['src', 'tests']
    .map((name) => path.join(projectRoot, name))
    .filter((target) => fs.existsSync(target));

  let timer = null;
  const schedule = (filePath) => {
    const rel = path.relative(projectRoot, filePath).split(path.sep)[0];
    if (watchIgnore.has(rel)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      cachedContentId = null;
      console.log(`[live-reload] change detected → ${reloadClients.size} client(s) id=${getContentId()}`);
      broadcastReload();
    }, 120);
  };

  for (const target of targets) {
    try {
      fs.watch(target, { recursive: true }, (_event, filename) => {
        schedule(filename ? path.join(target, filename) : target);
      });
    } catch (error) {
      console.warn(`[live-reload] watch failed for ${target}: ${error.message}`);
    }
  }
}

/**
 * Debug record upload from the app (src/scripts/sheet-debug.js). Body is a text
 * report (build, origin, recId, entries). Stored under .debug-rec/ (git-ignored)
 * so the agent can read it directly; never part of the web root.
 */
function handleRecordUpload(request, response) {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > 512 * 1024) {
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    try {
      if (!fs.existsSync(debugRecDir)) fs.mkdirSync(debugRecDir, { recursive: true });
      const body = Buffer.concat(chunks).toString('utf8');
      const recMatch = body.match(/recId:\s*([^\n\r]+)/);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeId = recMatch ? recMatch[1].trim().replace(/[^a-zA-Z0-9_-]/g, '') : '';
      const fileName = safeId ? `${safeId}-${stamp}.log` : `rec-${stamp}.log`;
      fs.writeFileSync(path.join(debugRecDir, fileName), body, 'utf8');
      console.log(`[debug-rec] saved ${fileName} (${body.length} bytes)`);
      sendHeaders(response, 200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, file: fileName }));
    } catch (error) {
      sendHeaders(response, 500, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, error: String((error && error.message) || error) }));
    }
  });
  request.on('error', () => {
    sendHeaders(response, 400, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: false, error: 'upload aborted' }));
  });
}

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url || '/').split('?')[0]);

  if (liveReload && urlPath === '/__livereload') {
    sendHeaders(response, 200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Connection': 'keep-alive',
    });
    response.write(': connected\n\n');
    reloadClients.add(response);
    request.on('close', () => reloadClients.delete(response));
    return;
  }

  if (liveReload && urlPath === '/__livereload.js') {
    sendHeaders(response, 200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    response.end(LIVE_RELOAD_CLIENT);
    return;
  }

  if (urlPath === '/__health') {
    sendHeaders(response, 200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      ok: true,
      liveReload,
      clients: reloadClients.size,
      id: getContentId()
    }));
    return;
  }

  if (urlPath === '/__build-id') {
    sendHeaders(response, 200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(buildIdPayload()));
    return;
  }

  if (urlPath === '/__rec' && request.method === 'POST') {
    handleRecordUpload(request, response);
    return;
  }

  const requestedPath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.resolve(webRoot, `.${requestedPath}`);

  if (!filePath.startsWith(webRoot + path.sep) && filePath !== webRoot) {
    sendHeaders(response, 403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    const target = !statError && stats.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    fs.readFile(target, (readError, content) => {
      if (readError) {
        sendHeaders(response, readError.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(readError.code === 'ENOENT' ? 'Not found' : 'Server error');
        return;
      }
      const ext = path.extname(target).toLowerCase();
      let body = content;
      if (ext === '.html') {
        body = injectBuildStamp(body);
        if (liveReload) body = injectLiveReload(body);
      }
      sendHeaders(response, 200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      response.end(body);
    });
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`\n本地服务器已启动： http://localhost:${port}`);
  const addresses = lanAddresses();
  if (addresses.length) {
    console.log('局域网设备请访问：');
    addresses.forEach(address => console.log(`  http://${address}:${port}`));
  } else {
    console.log('未找到局域网 IPv4 地址。');
  }
  if (liveReload) {
    console.log('Live reload: ON (file changes reload connected WebViews)');
    startWatchers();
  } else {
    console.log('Live reload: OFF');
  }
  console.log(`Content id: ${getContentId()}`);
  console.log('\n按 Ctrl+C 停止服务器。\n');
});

server.on('error', error => {
  console.error(`服务器无法启动：${error.message}`);
  process.exitCode = 1;
});
