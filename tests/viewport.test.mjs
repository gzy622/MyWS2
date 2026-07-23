import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveViewportMetrics } from '../scripts/viewport.js';

test('Visual Viewport 提供可见高度和非负顶部偏移', () => {
  assert.deepEqual(resolveViewportMetrics(800, { height: 520, offsetTop: 24 }, 800), {
    height: 520,
    offsetTop: 24
  });
  assert.deepEqual(resolveViewportMetrics(800, { height: 520, offsetTop: -5 }, 800), {
    height: 520,
    offsetTop: 0
  });
});

test('布局视口变化帧优先使用 innerHeight 并支持无 Visual Viewport 回退', () => {
  assert.deepEqual(resolveViewportMetrics(560, { height: 300, offsetTop: 0 }, 800), {
    height: 560,
    offsetTop: 0
  });
  assert.deepEqual(resolveViewportMetrics(720, null, 720), { height: 720, offsetTop: 0 });
});
