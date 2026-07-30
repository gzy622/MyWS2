import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AXIS_LOCK_DISTANCE,
  CLICK_SUPPRESS_MS,
  GHOST_GUARD_MS,
  IME_ACTION_DEDUP_MS,
  TAP_MOVE_TOLERANCE,
  armClickSuppressState,
  armGhostGuardState,
  buildGestureDebugDetail,
  canHandOffAtScrollEdge,
  clearClickSuppressState,
  createClickSuppressState,
  createGhostGuardState,
  isDragBeyondTap,
  resolveAxisLock,
  resolveClickSuppressEvent,
  resolveGhostGuardEvent,
  resolveImmediateAction,
  resolvePointerRelease
} from '../src/scripts/gesture-policy.js';

test('轴锁定：未超过阈值保持未锁定，超过后取主轴', () => {
  assert.equal(resolveAxisLock({ deltaX: 3, deltaY: 2 }), null);
  assert.equal(resolveAxisLock({ deltaX: AXIS_LOCK_DISTANCE, deltaY: 0 }), null);
  assert.equal(resolveAxisLock({ deltaX: AXIS_LOCK_DISTANCE + 0.1, deltaY: 0 }), 'x');
  assert.equal(resolveAxisLock({ deltaX: 2, deltaY: AXIS_LOCK_DISTANCE + 1 }), 'y');
  assert.equal(resolveAxisLock({ deltaX: 10, deltaY: 9 }), 'x');
  assert.equal(resolveAxisLock({ deltaX: 10, deltaY: 10 }), 'x');
  assert.equal(resolveAxisLock({ deltaX: -9, deltaY: 10 }), 'y');
});

test('轻点与拖动：超过 tap 容差视为拖动', () => {
  assert.equal(isDragBeyondTap({ deltaX: 0, deltaY: 0 }), false);
  assert.equal(isDragBeyondTap({ deltaX: TAP_MOVE_TOLERANCE, deltaY: 0 }), false);
  assert.equal(isDragBeyondTap({ deltaX: TAP_MOVE_TOLERANCE + 0.1, deltaY: 0 }), true);
});

test('释放激活：Sheet 短触直接激活且武装 click 抑制', () => {
  const result = resolvePointerRelease({
    cancelled: false,
    wasGesture: false,
    sheetMoved: false,
    handledSheet: true,
    claim: 'sheet',
    hasSheetTapControl: true,
    hasPostSheetCloseControl: false
  });
  assert.equal(result.activationSource, 'sheet-tap');
  assert.equal(result.armClickSuppress, true);
  assert.match(result.clearReason, /^activate:/);
});

test('释放激活：拖动后不补发轻点，但抑制尾随 click', () => {
  const result = resolvePointerRelease({
    cancelled: false,
    wasGesture: true,
    sheetMoved: false,
    handledSheet: false,
    claim: null,
    hasSheetTapControl: true,
    hasPostSheetCloseControl: false
  });
  assert.equal(result.activationSource, null);
  assert.equal(result.armClickSuppress, true);
  assert.equal(result.clearReason, 'drag');
});

test('释放激活：Sheet 关闭后底层短触可激活，拖动或取消则不激活', () => {
  const tap = resolvePointerRelease({
    cancelled: false,
    wasGesture: false,
    sheetMoved: false,
    handledSheet: false,
    claim: null,
    hasSheetTapControl: false,
    hasPostSheetCloseControl: true
  });
  assert.equal(tap.activationSource, 'post-sheet-close-tap');
  assert.equal(tap.armClickSuppress, true);

  const afterDrag = resolvePointerRelease({
    cancelled: false,
    wasGesture: true,
    sheetMoved: false,
    handledSheet: false,
    claim: null,
    hasSheetTapControl: false,
    hasPostSheetCloseControl: true
  });
  assert.equal(afterDrag.activationSource, null);

  const cancelled = resolvePointerRelease({
    cancelled: true,
    wasGesture: false,
    sheetMoved: false,
    handledSheet: true,
    claim: 'sheet',
    hasSheetTapControl: true,
    hasPostSheetCloseControl: true
  });
  assert.equal(cancelled.activationSource, null);
  assert.equal(cancelled.clearReason, 'pointercancel');
});

test('释放激活：Sheet 已跟手移动时不把短触当按钮激活', () => {
  const result = resolvePointerRelease({
    cancelled: false,
    wasGesture: false,
    sheetMoved: true,
    handledSheet: true,
    claim: 'sheet',
    hasSheetTapControl: true,
    hasPostSheetCloseControl: false
  });
  assert.equal(result.activationSource, null);
  assert.equal(result.armClickSuppress, true);
  assert.equal(result.clearReason, 'sheet-moved');
});

test('尾随 click 抑制：武装后吞掉 click，新 pointerdown 立即解除且不吞', () => {
  let state = createClickSuppressState();
  state = armClickSuppressState(state, 1000, CLICK_SUPPRESS_MS);
  assert.equal(state.armed, true);
  assert.equal(state.until, 1000 + CLICK_SUPPRESS_MS);

  const swallowed = resolveClickSuppressEvent(state, 1100, 'click');
  assert.equal(swallowed.swallow, true);
  assert.equal(swallowed.clearReason, 'swallowed-click');
  assert.equal(swallowed.next.armed, false);

  state = armClickSuppressState(clearClickSuppressState(), 2000);
  const clearedByDown = resolveClickSuppressEvent(state, 2050, 'pointerdown');
  assert.equal(clearedByDown.swallow, false);
  assert.equal(clearedByDown.clearReason, 'new-pointerdown');
  assert.equal(clearedByDown.next.armed, false);

  state = armClickSuppressState(createClickSuppressState(), 3000);
  const timedOut = resolveClickSuppressEvent(state, 3000 + CLICK_SUPPRESS_MS, 'click');
  assert.equal(timedOut.swallow, false);
  assert.equal(timedOut.clearReason, 'timeout');
});

test('幽灵点击保护：匹配底层命中才吞；新触摸立即解除且不要求第二次点击', () => {
  let state = createGhostGuardState();
  state = armGhostGuardState(state, 1000, GHOST_GUARD_MS);

  const hit = resolveGhostGuardEvent(state, 1100, 'click', true);
  assert.equal(hit.swallow, true);
  assert.equal(hit.clearReason, 'swallowed-ghost-click');

  state = armGhostGuardState(createGhostGuardState(), 2000);
  const miss = resolveGhostGuardEvent(state, 2100, 'click', false);
  assert.equal(miss.swallow, false);
  assert.equal(miss.clearReason, 'click-miss-cleared');
  assert.equal(miss.next.armed, false);

  state = armGhostGuardState(createGhostGuardState(), 3000);
  const nextTouch = resolveGhostGuardEvent(state, 3010, 'pointerdown', true);
  assert.equal(nextTouch.swallow, false);
  assert.equal(nextTouch.clearReason, 'new-pointerdown');
  assert.equal(nextTouch.next.armed, false);
});

test('IME 立即操作：pointerdown 执行一次，合成 click 在去重窗内不重复执行', () => {
  const down = resolveImmediateAction({
    lastRanAt: 0,
    now: 1000,
    source: 'pointerdown'
  });
  assert.equal(down.run, true);
  assert.equal(down.activationSource, 'ime-pointerdown');
  assert.equal(down.nextRanAt, 1000);

  const ghostClick = resolveImmediateAction({
    lastRanAt: down.nextRanAt,
    now: 1000 + IME_ACTION_DEDUP_MS - 1,
    source: 'click'
  });
  assert.equal(ghostClick.run, false);
  assert.equal(ghostClick.suppressSyntheticClick, true);
  assert.equal(ghostClick.clearReason, 'ime-click-dedup');

  const laterClick = resolveImmediateAction({
    lastRanAt: down.nextRanAt,
    now: 1000 + IME_ACTION_DEDUP_MS,
    source: 'click'
  });
  assert.equal(laterClick.run, true);
  assert.equal(laterClick.activationSource, 'ime-click-fallback');
});

test('滚动边缘交接：同一次手势滚离边缘后再触边不得交接', () => {
  assert.equal(canHandOffAtScrollEdge({
    startAtEdge: true,
    scrolledAwayFromEdge: false,
    nowAtEdge: true
  }), true);
  assert.equal(canHandOffAtScrollEdge({
    startAtEdge: true,
    scrolledAwayFromEdge: true,
    nowAtEdge: true
  }), false);
  assert.equal(canHandOffAtScrollEdge({
    startAtEdge: false,
    scrolledAwayFromEdge: false,
    nowAtEdge: true
  }), false);
});

test('诊断字段只保留安全键，不附带姓名成绩或输入文案', () => {
  const detail = buildGestureDebugDetail({
    sessionId: 'g3',
    owner: 'gestures',
    activationSource: 'sheet-tap',
    clearReason: 'pointercancel',
    claim: 'sheet',
    axis: 'y',
    cancelled: true,
    pointerType: 'touch',
    // @ts-expect-error intentional leak attempt
    studentName: '张三',
    score: 95,
    inputValue: '作业名'
  });
  assert.deepEqual(detail, {
    sessionId: 'g3',
    owner: 'gestures',
    activationSource: 'sheet-tap',
    clearReason: 'pointercancel',
    claim: 'sheet',
    axis: 'y',
    cancelled: true,
    pointerType: 'touch'
  });
  assert.equal('studentName' in detail, false);
  assert.equal('score' in detail, false);
  assert.equal('inputValue' in detail, false);
});
