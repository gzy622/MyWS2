import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OVERLAY_CLOSE_ORDER,
  OVERLAY_IDS,
  OVERLAY_STACK,
  SHEET_STACK_ORDER,
  getOverlayMeta,
  isOverlayId
} from '../src/scripts/overlay-stack.js';

test('浮层定义 ID 唯一，关闭顺序直接来自权威定义', () => {
  const ids = OVERLAY_STACK.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(OVERLAY_CLOSE_ORDER, ids);
  assert.equal(ids[0], OVERLAY_IDS.confirm);
  assert.equal(ids.at(-1), OVERLAY_IDS.seatLandscape);
});

test('Sheet 栈是权威浮层定义的有序投影', () => {
  const expected = OVERLAY_STACK
    .filter(({ type }) => type === 'sheet')
    .map(({ id }) => id);
  assert.deepEqual(SHEET_STACK_ORDER, expected);
  assert.ok(SHEET_STACK_ORDER.includes(OVERLAY_IDS.more));
  assert.ok(!SHEET_STACK_ORDER.includes(OVERLAY_IDS.rosterEditor));
  assert.ok(!SHEET_STACK_ORDER.includes(OVERLAY_IDS.fontSize));
});

test('浮层查询只接受已注册 ID', () => {
  assert.equal(isOverlayId(OVERLAY_IDS.rosterEditor), true);
  assert.equal(getOverlayMeta(OVERLAY_IDS.more)?.layer, 'modal');
  assert.equal(isOverlayId('unknown-overlay'), false);
  assert.equal(getOverlayMeta('unknown-overlay'), null);
});
