import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultRosterState, isValidRosterState, SEAT_COUNT } from '../scripts/roster-model.js';
import { createRosterStore } from '../scripts/roster-store.js';

test('默认名单、座位和作业满足领域不变量', () => {
  const state = createDefaultRosterState();
  assert.equal(state.students.length, 46);
  assert.equal(state.seats.length, 46);
  assert.equal(new Set(state.seats.map(({ seatIndex }) => seatIndex)).size, 46);
  assert.ok(state.seats.every(({ seatIndex }) => seatIndex >= 0 && seatIndex < SEAT_COUNT));
  assert.deepEqual(state.assignments, [{ id: 1, name: '作业 1' }]);
  assert.ok(isValidRosterState(state));
});

test('快照不可反向修改 Store，订阅只在有效变更后触发', () => {
  const store = createRosterStore();
  const changes = [];
  store.subscribe((state) => changes.push(state));
  const snapshot = store.getSnapshot();
  snapshot.students[0].name = '篡改';
  snapshot.seats[0].seatIndex = 0;
  assert.equal(store.getSnapshot().students[0].name, '赵予安');
  assert.equal(store.getSnapshot().seats[0].seatIndex, 17);
  assert.equal(store.toggleCompletion(0), false);
  assert.equal(changes.length, 0);
  assert.equal(store.toggleCompletion(1), true);
  assert.equal(changes.length, 1);
});

test('完成、计分和清除记录保持关联一致', () => {
  const store = createRosterStore();
  assert.equal(store.toggleCompletion(1), true);
  assert.equal(store.getCompletedCount(), 1);
  assert.equal(store.setScore(1, '88.5'), 'saved');
  assert.equal(store.getScore(1), 88.5);
  assert.deepEqual(store.getCompletedStudentIds(), new Set([1]));
  assert.equal(store.toggleCompletion(1), true);
  assert.equal(store.getScore(1), undefined);
  assert.equal(store.getCompletedCount(), 0);
  assert.equal(store.setScore(1, 100), 'saved');
  assert.equal(store.clearStudentRecord(1), true);
  assert.equal(store.getCompletedCount(), 0);
  assert.equal(store.getScore(1), undefined);
});

test('分数拒绝越界、空格式和多位小数', () => {
  const store = createRosterStore();
  for (const value of [-1, 100.1, '10.22', '', ' ', 'abc', Infinity]) {
    assert.equal(store.setScore(1, value), 'invalid');
  }
  assert.equal(store.setScore(1, 0), 'saved');
  assert.equal(store.setScore(1, '100'), 'saved');
  assert.equal(store.getScore(1), 100);
});

test('作业生命周期隔离提交与评分，删除活动作业选择相邻项', () => {
  const store = createRosterStore();
  store.setScore(1, 80);
  const second = store.addAssignment('  第二次作业  ');
  assert.deepEqual(second, { id: 2, name: '第二次作业' });
  assert.equal(store.getCompletedCount(), 0);
  store.toggleCompletion(2);
  assert.equal(store.selectAssignment(1), true);
  assert.equal(store.getScore(1), 80);
  assert.equal(store.deleteAssignment(1), true);
  assert.equal(store.getCurrentAssignment().id, 2);
  assert.equal(store.getSnapshot().scores.length, 0);
  assert.equal(store.deleteAssignment(2), false);
  assert.equal(store.renameAssignment(2, '  '), false);
});

test('批量操作仅作用于活动作业，未交名单保持名单顺序', () => {
  const store = createRosterStore();
  store.toggleCompletion(2);
  assert.deepEqual(store.getMissingStudents().slice(0, 2).map(({ id }) => id), [1, 3]);
  assert.equal(store.markAllCompleted(), true);
  assert.equal(store.getCompletedCount(), 46);
  assert.equal(store.markAllCompleted(), false);
  assert.equal(store.clearCurrentAssignment(), true);
  assert.equal(store.getCompletedCount(), 0);
});

test('移动和交换座位不会产生重复位置或非法引用', () => {
  const store = createRosterStore();
  const before = store.getSnapshot();
  const firstSeat = before.seats.find(({ studentId }) => studentId === 1).seatIndex;
  const secondSeat = before.seats.find(({ studentId }) => studentId === 2).seatIndex;
  assert.equal(store.moveStudentSeat(1, secondSeat), true);
  const afterSwap = store.getSnapshot();
  assert.equal(afterSwap.seats.find(({ studentId }) => studentId === 1).seatIndex, secondSeat);
  assert.equal(afterSwap.seats.find(({ studentId }) => studentId === 2).seatIndex, firstSeat);
  assert.equal(store.moveStudentSeat(1, 0), true);
  assert.equal(store.moveStudentSeat(1, -1), false);
  assert.equal(store.moveStudentSeat(99, 0), false);
  assert.equal(new Set(store.getSnapshot().seats.map(({ seatIndex }) => seatIndex)).size, 46);
});

test('恢复默认名单和座位时保留作业，清空全部登记记录', () => {
  const store = createRosterStore();
  store.addAssignment('第二次作业');
  store.setScore(1, 60);
  store.moveStudentSeat(1, 0);
  store.resetRoster();
  const state = store.getSnapshot();
  assert.equal(state.assignments.length, 2);
  assert.equal(state.activeAssignmentId, 2);
  assert.equal(state.submissions.length, 0);
  assert.equal(state.scores.length, 0);
  assert.equal(state.seats.find(({ studentId }) => studentId === 1).seatIndex, 17);
});

test('非法初始状态整体回退默认领域状态', () => {
  const invalid = createDefaultRosterState();
  invalid.seats[1].seatIndex = invalid.seats[0].seatIndex;
  const store = createRosterStore(invalid);
  assert.equal(store.getSnapshot().seats.find(({ studentId }) => studentId === 1).seatIndex, 17);
});

test('有效变更触发持久化且写入异常不破坏内存会话', () => {
  const snapshots = [];
  const store = createRosterStore(createDefaultRosterState(), (state) => snapshots.push(state));
  assert.equal(store.toggleCompletion(1), true);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].submissions.length, 1);
  snapshots[0].submissions.length = 0;
  assert.equal(store.getSnapshot().submissions.length, 1);

  const failingStore = createRosterStore(createDefaultRosterState(), () => { throw new Error('full'); });
  assert.doesNotThrow(() => failingStore.toggleCompletion(1));
  assert.equal(failingStore.getCompletedStudentIds().has(1), true);
});
