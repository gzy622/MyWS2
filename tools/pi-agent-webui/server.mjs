import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentManager } from './agent-manager.mjs';

const TOOL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.join(TOOL_ROOT, 'public');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4312;
const MAX_BODY_BYTES = 32 * 1024;

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
});

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'none'; font-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
});

function sendJson(response, status, payload) {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('任务内容过长。');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error('请求内容无法识别。');
  }
}

function hasControlAccess(request) {
  return !request.headers.origin && request.headers['x-pi-agent-control'] === 'codex';
}

async function serveStatic(response, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const normalized = path.normalize(relativePath);
  const filePath = path.resolve(PUBLIC_ROOT, normalized);
  if (!filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`) && filePath !== path.join(PUBLIC_ROOT, 'index.html')) {
    sendJson(response, 404, { error: '页面不存在。' });
    return;
  }
  try {
    const [realRoot, realFile] = await Promise.all([realpath(PUBLIC_ROOT), realpath(filePath)]);
    if (!realFile.startsWith(`${realRoot}${path.sep}`)) {
      sendJson(response, 404, { error: '页面不存在。' });
      return;
    }
    const body = await readFile(realFile);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME_TYPES[path.extname(realFile)] || 'application/octet-stream'
    });
    response.end(body);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendJson(response, 404, { error: '页面不存在。' });
      return;
    }
    sendJson(response, 500, { error: '页面读取失败。' });
  }
}

export function createPiWebUiServer({ workspaceRoot, manager } = {}) {
  const root = workspaceRoot || path.resolve(TOOL_ROOT, '..', '..');
  const agentManager = manager || createAgentManager({ workspaceRoot: root });
  const eventClients = new Set();
  let cleanedUp = false;

  function broadcast(agents) {
    const message = `event: state\ndata: ${JSON.stringify({ agents })}\n\n`;
    for (const client of eventClients) {
      if (client.destroyed || client.writableEnded || !client.write(message)) {
        eventClients.delete(client);
        client.end();
      }
    }
  }

  const unsubscribe = agentManager.subscribe(broadcast);
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
    const { pathname } = requestUrl;

    if (pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, { ok: true, active: agentManager.list().filter((agent) => ['starting', 'running'].includes(agent.status)).length });
      return;
    }

    if (pathname === '/api/agents' && request.method === 'GET') {
      sendJson(response, 200, { agents: agentManager.list() });
      return;
    }

    if (pathname === '/api/events' && request.method === 'GET') {
      if (eventClients.size >= 10) {
        sendJson(response, 503, { error: '状态连接数量已满。' });
        return;
      }
      response.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive'
      });
      eventClients.add(response);
      response.on('error', () => eventClients.delete(response));
      response.write(`event: state\ndata: ${JSON.stringify({ agents: agentManager.list() })}\n\n`);
      request.on('close', () => eventClients.delete(response));
      return;
    }

    if (pathname === '/api/control/agents' && request.method === 'POST') {
      if (!hasControlAccess(request)) {
        sendJson(response, 403, { error: '该操作只允许 Codex 本机控制命令调用。' });
        return;
      }
      try {
        const body = await readJson(request);
        sendJson(response, 201, { agent: agentManager.start(body) });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }

    const stopMatch = pathname.match(/^\/api\/control\/agents\/([^/]+)\/stop$/);
    if (stopMatch && request.method === 'POST') {
      if (!hasControlAccess(request)) {
        sendJson(response, 403, { error: '该操作只允许 Codex 本机控制命令调用。' });
        return;
      }
      try {
        sendJson(response, 200, { agent: agentManager.stop(decodeURIComponent(stopMatch[1])) });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === 'GET') {
      await serveStatic(response, pathname);
      return;
    }

    sendJson(response, 404, { error: '请求不存在。' });
  });

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    unsubscribe();
    agentManager.stopAll();
    for (const client of eventClients) client.end();
    eventClients.clear();
  }

  server.shutdown = () => {
    cleanup();
    server.close();
  };
  server.on('close', cleanup);

  return server;
}

function isDirectRun() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const host = DEFAULT_HOST;
  const port = Number.parseInt(process.env.PI_WEBUI_PORT || String(DEFAULT_PORT), 10);
  const workspaceRoot = path.resolve(TOOL_ROOT, '..', '..');
  const server = createPiWebUiServer({ workspaceRoot });
  server.listen(port, host, () => {
    console.log(`Pi 子智能体 WebUI 已启动：http://${host}:${port}`);
    console.log('关闭此窗口即可停止 WebUI 和由它启动的子智能体。');
  });
  const shutdown = () => server.shutdown();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
