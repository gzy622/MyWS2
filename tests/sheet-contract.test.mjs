import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bindSheetScrimClose } from '../src/scripts/sheet-drag.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('Sheet 真实遮罩是统一的脚本手势表面', async () => {
  const css = await read('src/styles/sheets.css');
  const block = css.match(/\.sheet-scrim\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body;
  assert.ok(block, '缺少 .sheet-scrim 共享规则');
  assert.match(block, /pointer-events:\s*auto\s*;/);
  assert.match(block, /touch-action:\s*none\s*;/);
});

test('Sheet 遮罩关闭契约缺失时立即失败', () => {
  assert.throws(() => {
    bindSheetScrimClose(new EventTarget(), {
      sheetId: 'invalid-sheet',
      isActive: () => false
    });
  }, /invalid-sheet.*managed scrim close contract/);
});

test('Sheet 遮罩仅在静止轻点时请求关闭', () => {
  const scrim = new EventTarget();
  let active = false;
  let closeCount = 0;
  bindSheetScrimClose(scrim, {
    sheetId: 'test-sheet',
    isActive: () => active,
    onRequestClose: () => { closeCount += 1; }
  });

  scrim.dispatchEvent(new Event('click'));
  assert.equal(closeCount, 1);

  active = true;
  scrim.dispatchEvent(new Event('click'));
  assert.equal(closeCount, 1, '拖动或落位产生的尾随 click 不得重复关闭');
});

test('所有业务 Sheet 注册都声明统一遮罩关闭入口', async () => {
  const scriptsDir = path.join(root, 'src/scripts');
  const names = (await readdir(scriptsDir)).filter((name) => name.endsWith('.js'));
  let controllerCount = 0;
  let closeContractCount = 0;

  for (const name of names) {
    if (name === 'sheet-drag.js') continue;
    const source = await read(`src/scripts/${name}`);
    controllerCount += source.match(/createSheetController\s*\(\s*\{/g)?.length ?? 0;
    closeContractCount += source.match(/\bonRequestClose\s*:/g)?.length ?? 0;
  }

  assert.ok(controllerCount > 0, '未发现业务 Sheet 注册');
  assert.equal(closeContractCount, controllerCount, '每个 Sheet 必须由控制器统一处理遮罩关闭');
});
