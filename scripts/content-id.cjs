/**
 * Shared content fingerprint for demo web assets (index.html + styles + scripts).
 * Used by lan-server, sync-capacitor-www, and `npm run code:id`.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT_ENTRIES = ['index.html', 'styles', 'scripts'];

function shouldSkipName(name) {
  return name === 'build-id.json'
    || name === 'node_modules'
    || name === 'content-id.cjs'
    || name.startsWith('.');
}

function collectFiles(root) {
  const files = [];

  function walk(rel) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    const stats = fs.statSync(abs);
    if (stats.isDirectory()) {
      for (const name of fs.readdirSync(abs).sort()) {
        if (shouldSkipName(name)) continue;
        walk(path.join(rel, name).replace(/\\/g, '/'));
      }
      return;
    }
    files.push(rel.replace(/\\/g, '/'));
  }

  for (const entry of ROOT_ENTRIES) walk(entry);
  return files.sort();
}

function computeContentId(root = process.cwd()) {
  const hash = crypto.createHash('sha256');
  for (const rel of collectFiles(root)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, rel)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || '.');
  process.stdout.write(`${computeContentId(root)}\n`);
}

module.exports = { computeContentId, collectFiles };
