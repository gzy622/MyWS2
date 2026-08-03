import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { computeContentId } = require('../tools/content-id.cjs');

test('content fingerprint uses grouped Crockford Base32 and changes with source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twb-content-id-'));
  try {
    const scripts = path.join(root, 'src', 'scripts');
    fs.mkdirSync(scripts, { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'index.html'), '<main>one</main>\n');
    fs.writeFileSync(path.join(scripts, 'main.js'), 'export const value = 1;\n');

    const first = computeContentId(root);
    assert.match(first, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$/);
    assert.equal(computeContentId(root), first);

    fs.writeFileSync(path.join(scripts, 'main.js'), 'export const value = 2;\n');
    assert.notEqual(computeContentId(root), first);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
