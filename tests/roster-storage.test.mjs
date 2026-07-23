import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultRosterState } from '../scripts/roster-model.js';
import {
  loadRosterState,
  parseStoredRoster,
  ROSTER_STORAGE_KEY,
  saveRosterState
} from '../scripts/roster-storage.js';

function memoryStorage(initialValue = null) {
  const values = new Map(initialValue === null ? [] : [[ROSTER_STORAGE_KEY, initialValue]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: () => values.get(ROSTER_STORAGE_KEY)
  };
}

test('合法 Schema 1 可完整保存并恢复', () => {
  const state = createDefaultRosterState();
  state.submissions.push({ assignmentId: 1, studentId: 1 });
  state.scores.push({ assignmentId: 1, studentId: 1, value: 95.5 });
  const storage = memoryStorage();
  assert.equal(saveRosterState(state, storage), true);
  assert.deepEqual(loadRosterState(storage), state);
  assert.notEqual(loadRosterState(storage), state);
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
