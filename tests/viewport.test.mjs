import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveViewportMetrics } from '../scripts/viewport.js';

test('无输入焦点时壳层跟随布局高度，并可带非负顶部偏移', () => {
  assert.deepEqual(resolveViewportMetrics(800, { height: 520, offsetTop: 24 }, 800), {
    height: 800,
    offsetTop: 24,
    imeInsetBottom: 0,
    imeOpen: false,
    baselineHeight: 800
  });
  assert.deepEqual(resolveViewportMetrics(800, { height: 520, offsetTop: -5 }, 800), {
    height: 800,
    offsetTop: 0,
    imeInsetBottom: 0,
    imeOpen: false,
    baselineHeight: 800
  });
});

test('布局视口变化时更新基线，并支持无 Visual Viewport 回退', () => {
  assert.deepEqual(resolveViewportMetrics(560, { height: 300, offsetTop: 0 }, 800), {
    height: 560,
    offsetTop: 0,
    imeInsetBottom: 0,
    imeOpen: false,
    baselineHeight: 560
  });
  assert.deepEqual(resolveViewportMetrics(720, null, 720), {
    height: 720,
    offsetTop: 0,
    imeInsetBottom: 0,
    imeOpen: false,
    baselineHeight: 720
  });
});

test('文本输入聚焦时壳层保持基线，仅浮层使用键盘 inset', () => {
  assert.deepEqual(
    resolveViewportMetrics(800, { height: 420, offsetTop: 0 }, 800, { textEntryFocused: true }),
    {
      height: 800,
      offsetTop: 0,
      imeInsetBottom: 380,
      imeOpen: true,
      baselineHeight: 800
    }
  );
});

test('文本输入聚焦且 innerHeight 被压矮时仍锁定壳层基线', () => {
  assert.deepEqual(
    resolveViewportMetrics(480, { height: 480, offsetTop: 0 }, 800, { textEntryFocused: true }),
    {
      height: 800,
      offsetTop: 0,
      imeInsetBottom: 320,
      imeOpen: true,
      baselineHeight: 800
    }
  );
});
