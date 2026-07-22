#!/usr/bin/env node
/**
 * Zero-dependency LAN static server for this demo.
 * Run through start-lan-server.bat on Windows.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = __dirname;
const port = Number(process.env.PORT || process.argv[2] || 8080);
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

function sendHeaders(response, statusCode, headers = {}) {
  response.writeHead(statusCode, { ...noCacheHeaders, ...headers });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && item.family === 'IPv4' && !item.internal)
    .map(item => item.address);
}

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const requestedPath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.resolve(root, `.${requestedPath}`);

  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
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
      sendHeaders(response, 200, { 'Content-Type': mimeTypes[path.extname(target).toLowerCase()] || 'application/octet-stream' });
      response.end(content);
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
  console.log('\n按 Ctrl+C 停止服务器。\n');
});

server.on('error', error => {
  console.error(`服务器无法启动：${error.message}`);
  process.exitCode = 1;
});
