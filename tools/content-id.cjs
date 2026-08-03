/**
 * Shared content fingerprint for demo web assets under src/.
 * Used by lan-server, sync-web-assets, and `npm run code:id`.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT_ENTRIES = ['src/index.html', 'src/styles', 'src/scripts'];
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function shouldSkipName(name) {
  return name === 'build-id.json'
    || name === 'node_modules'
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

function formatContentId(digest) {
  let value = 0;
  let bitCount = 0;
  let compact = '';

  for (const byte of digest) {
    value = (value << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5 && compact.length < 10) {
      bitCount -= 5;
      compact += CROCKFORD_BASE32[(value >>> bitCount) & 31];
    }
    if (compact.length >= 10) break;
    value &= (1 << bitCount) - 1;
  }

  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 10)}`;
}

function computeContentId(root = process.cwd()) {
  const hash = crypto.createHash('sha256');
  for (const rel of collectFiles(root)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, rel)));
    hash.update('\0');
  }
  return formatContentId(hash.digest());
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || '.');
  process.stdout.write(`${computeContentId(root)}\n`);
}

module.exports = { computeContentId, collectFiles, formatContentId };
