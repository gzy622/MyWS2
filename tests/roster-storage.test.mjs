import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultRosterState } from '../src/scripts/roster-model.js';
import {
  loadRosterState,
  parseStoredRoster,
  ROSTER_STORAGE_KEY,
  saveRosterState
} from '../src/scripts/roster-storage.js';

function memoryStorage(initialValue = null) {
  const values = new Map(initialValue === null ? [] : [[ROSTER_STORAGE_KEY, initialValue]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: () => values.get(ROSTER_STORAGE_KEY)
  };
}

test('合法 Schema 6 可完整保存并恢复', () => {
  const state = createDefaultRosterState();
  state.submissions.push({ assignmentId: 1, studentId: 1 });
  state.scores.push({ assignmentId: 1, studentId: 1, value: 95.5 });
  state.roles[0].studentIds = [1, 2];
  state.duties[0].studentIds = [3];
  state.scheduleSlots.push({ day: 0, periodId: 2, subject: '语文' });
  state.courseGrades.push({ examId: 1, subjectId: 1, studentId: 1, value: 88 });
  const storage = memoryStorage();
  assert.equal(saveRosterState(state, storage), true);
  assert.deepEqual(loadRosterState(storage), state);
  assert.notEqual(loadRosterState(storage), state);
});

test('Schema 6 非法首字母整体回退默认值', () => {
  const lowercase = createDefaultRosterState();
  lowercase.students[0].initial = 'g';
  assert.equal(parseStoredRoster(lowercase), null);
  const multiChar = createDefaultRosterState();
  multiChar.students[0].initial = 'AB';
  assert.equal(parseStoredRoster(multiChar), null);
  const numeric = createDefaultRosterState();
  numeric.students[0].initial = '1';
  assert.equal(parseStoredRoster(numeric), null);
});

test('损坏 JSON、未知版本和引用失效整体回退默认值', () => {
  const defaults = createDefaultRosterState();
  assert.deepEqual(loadRosterState(memoryStorage('{')), defaults);
  const unknown = { ...defaults, schemaVersion: 99 };
  assert.equal(parseStoredRoster(unknown), null);
  const invalid = createDefaultRosterState();
  invalid.seats[0].studentId = 999;
  assert.equal(parseStoredRoster(invalid), null);
  assert.deepEqual(loadRosterState(memoryStorage(JSON.stringify(invalid))), defaults);
  const badRole = createDefaultRosterState();
  badRole.roles[0].studentIds = [999];
  assert.equal(parseStoredRoster(badRole), null);
  const badSlot = createDefaultRosterState();
  badSlot.scheduleSlots.push({ day: 0, periodId: 99, subject: '语文' });
  assert.equal(parseStoredRoster(badSlot), null);
});

test('重复记录和无提交分数被拒绝', () => {
  const duplicate = createDefaultRosterState();
  duplicate.submissions.push(
    { assignmentId: 1, studentId: 1 },
    { assignmentId: 1, studentId: 1 }
  );
  assert.equal(parseStoredRoster(duplicate), null);
  const orphanScore = createDefaultRosterState();
  orphanScore.scores.push({ assignmentId: 1, studentId: 1, value: 80 });
  assert.equal(parseStoredRoster(orphanScore), null);
});

test('读取和写入异常不会阻止启动或内存操作', () => {
  const throwing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('full'); }
  };
  assert.deepEqual(loadRosterState(throwing), createDefaultRosterState());
  assert.equal(saveRosterState(createDefaultRosterState(), throwing), false);
});
