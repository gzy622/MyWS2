import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultRosterState,
  ROSTER_LEGACY_SCHEMA_VERSION,
  ROSTER_SCHEMA_VERSION_V2
} from '../scripts/roster-model.js';
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

function createLegacyV1State() {
  const state = createDefaultRosterState();
  return {
    schemaVersion: ROSTER_LEGACY_SCHEMA_VERSION,
    students: state.students,
    seats: state.seats,
    assignments: state.assignments,
    activeAssignmentId: state.activeAssignmentId,
    submissions: [{ assignmentId: 1, studentId: 1 }],
    scores: [{ assignmentId: 1, studentId: 1, value: 95.5 }],
    nextAssignmentId: state.nextAssignmentId
  };
}

function createLegacyV2State() {
  const state = createDefaultRosterState();
  return {
    schemaVersion: ROSTER_SCHEMA_VERSION_V2,
    students: state.students,
    seats: state.seats,
    assignments: state.assignments,
    activeAssignmentId: state.activeAssignmentId,
    submissions: [{ assignmentId: 1, studentId: 1 }],
    scores: [{ assignmentId: 1, studentId: 1, value: 95.5 }],
    nextAssignmentId: state.nextAssignmentId,
    roles: state.roles.map((role) => ({ ...role, studentId: role.id === 1 ? 1 : null })),
    duties: state.duties.map((duty) => ({ ...duty })),
    nextRoleId: state.nextRoleId,
    nextDutyId: state.nextDutyId
  };
}

test('合法 Schema 3 可完整保存并恢复', () => {
  const state = createDefaultRosterState();
  state.submissions.push({ assignmentId: 1, studentId: 1 });
  state.scores.push({ assignmentId: 1, studentId: 1, value: 95.5 });
  state.roles[0].studentId = 1;
  state.duties[0].studentId = 2;
  state.scheduleSlots.push({ day: 0, periodId: 2, subject: '语文' });
  state.courseGrades.push({ subjectId: 1, studentId: 1, value: 88 });
  const storage = memoryStorage();
  assert.equal(saveRosterState(state, storage), true);
  assert.deepEqual(loadRosterState(storage), state);
  assert.notEqual(loadRosterState(storage), state);
});

test('Schema 1 迁移为 Schema 3 并注入默认人员与课程', () => {
  const legacy = createLegacyV1State();
  const migrated = parseStoredRoster(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.submissions.length, 1);
  assert.equal(migrated.scores[0].value, 95.5);
  assert.equal(migrated.roles.length, 4);
  assert.equal(migrated.duties.length, 3);
  assert.ok(migrated.roles.every((role) => role.studentId === null));
  assert.ok(migrated.duties.every((duty) => duty.studentId === null));
  assert.equal(migrated.periods.length, 10);
  assert.equal(migrated.subjects.length, 3);
  assert.equal(migrated.scheduleSlots.length, 0);
  assert.equal(migrated.courseGrades.length, 0);

  const storage = memoryStorage(JSON.stringify(legacy));
  const loaded = loadRosterState(storage);
  assert.equal(loaded.schemaVersion, 3);
  assert.equal(loaded.roles[0].title, '班长');
  assert.equal(loaded.periods[0].title, '早读');
});

test('Schema 2 迁移为 Schema 3 并保留人员指派、注入空课表', () => {
  const legacy = createLegacyV2State();
  const migrated = parseStoredRoster(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.roles[0].studentId, 1);
  assert.equal(migrated.periods.length, 10);
  assert.equal(migrated.subjects[0].title, '语文');
  assert.equal(migrated.scheduleSlots.length, 0);
  assert.equal(migrated.courseGrades.length, 0);
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
  badRole.roles[0].studentId = 999;
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
