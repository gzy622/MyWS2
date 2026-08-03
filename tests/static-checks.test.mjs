import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptsDir = fileURLToPath(new URL('../src/scripts/', import.meta.url));

test('所有 src/scripts/*.js 语法有效', () => {
  const files = readdirSync(scriptsDir).filter((name) => name.endsWith('.js'));
  assert.ok(files.length > 0, '应至少存在一个脚本文件');
  for (const name of files) {
    const file = `${scriptsDir}${name}`;
    assert.doesNotThrow(
      () => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }),
      `${name} 语法错误`
    );
  }
});
