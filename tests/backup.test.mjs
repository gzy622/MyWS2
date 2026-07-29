import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultRosterState,
  ROSTER_LEGACY_SCHEMA_VERSION,
  ROSTER_SCHEMA_VERSION,
  ROSTER_SCHEMA_VERSION_V2,
  ROSTER_SCHEMA_VERSION_V3,
  ROSTER_SCHEMA_VERSION_V4
} from '../src/scripts/roster-model.js';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  createBackup,
  serializeBackup,
  generateBackupFilename,
  parseBackup
} from '../src/scripts/backup.js';

test('当前 Schema 可导出并重新导入', () => {
  const original = createDefaultRosterState();
  original.submissions.push({ assignmentId: 1, studentId: 1 });
  original.scores.push({ assignmentId: 1, studentId: 1, value: 95.5 });
  original.roles[0].studentIds = [1, 2];
  original.duties[0].studentIds = [3];
  original.scheduleSlots.push({ day: 0, periodId: 2, subject: '语文' });
  original.courseGrades.push({ examId: 1, subjectId: 1, studentId: 1, value: 88 });

  const backup = createBackup(original);
  const json = serializeBackup(backup);
  const result = parseBackup(json);

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, original);
  assert.notEqual(result.data, original); // different reference
});

test('导出内容包含格式版本和业务 Schema 版本', () => {
  const backup = createBackup(createDefaultRosterState());
  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backup.formatVersion, BACKUP_FORMAT_VERSION);
  assert.ok(typeof backup.exportedAt === 'string' && backup.exportedAt.length > 0);
  assert.equal(backup.data.schemaVersion, ROSTER_SCHEMA_VERSION);
});

test('Schema 1 备份可迁移至当前版本', () => {
  const state = createDefaultRosterState();
  const legacy = {
    schemaVersion: ROSTER_LEGACY_SCHEMA_VERSION,
    students: state.students,
    seats: state.seats,
    assignments: state.assignments,
    activeAssignmentId: state.activeAssignmentId,
    submissions: [{ assignmentId: 1, studentId: 1 }],
    scores: [{ assignmentId: 1, studentId: 1, value: 95.5 }],
    nextAssignmentId: state.nextAssignmentId
  };

  const backup = { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, exportedAt: new Date().toISOString(), data: legacy };
  const json = serializeBackup(backup);
  const result = parseBackup(json);

  assert.equal(result.ok, true);
  assert.equal(result.data.schemaVersion, ROSTER_SCHEMA_VERSION);
  assert.equal(result.data.roles.length, 4);
  assert.equal(result.data.duties.length, 3);
  assert.equal(result.data.periods.length, 10);
  assert.equal(result.data.subjects.length, 3);
  assert.ok(result.data.roles.every((r) => Array.isArray(r.studentIds)));
  assert.equal(result.data.submissions.length, 1);
  assert.equal(result.data.scores[0].value, 95.5);
});

test('Schema 2 备份可迁移至当前版本', () => {
  const state = createDefaultRosterState();
  const legacy = {
    schemaVersion: ROSTER_SCHEMA_VERSION_V2,
    students: state.students,
    seats: state.seats,
    assignments: state.assignments,
    activeAssignmentId: state.activeAssignmentId,
    submissions: [{ assignmentId: 1, studentId: 2 }],
    scores: [{ assignmentId: 1, studentId: 2, value: 88 }],
    nextAssignmentId: state.nextAssignmentId,
    roles: state.roles.map((role) => ({ id: role.id, title: role.title, studentId: role.id === 2 ? 3 : null })),
    duties: state.duties.map((duty) => ({ id: duty.id, title: duty.title, note: duty.note, studentId: null })),
    nextRoleId: state.nextRoleId,
    nextDutyId: state.nextDutyId
  };

  const backup = { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, exportedAt: new Date().toISOString(), data: legacy };
  const json = serializeBackup(backup);
  const result = parseBackup(json);

  assert.equal(result.ok, true);
  assert.equal(result.data.schemaVersion, ROSTER_SCHEMA_VERSION);
  assert.deepEqual(result.data.roles[1].studentIds, [3]);
  assert.equal(result.data.periods.length, 10);
  assert.equal(result.data.subjects.length, 3);
  assert.equal(result.data.scheduleSlots.length, 0);
});

test('Schema 3 备份可迁移至当前版本', () => {
  const state = createDefaultRosterState();
  const legacy = {
    schemaVersion: ROSTER_SCHEMA_VERSION_V3,
    students: state.students,
    seats: state.seats,
    assignments: state.assignments,
    activeAssignmentId: state.activeAssignmentId,
    submissions: [{ assignmentId: 1, studentId: 1 }],
    scores: [{ assignmentId: 1, studentId: 1, value: 90 }],
    nextAssignmentId: state.nextAssignmentId,
    roles: state.roles.map((role) => ({ id: role.id, title: role.title, studentId: role.id === 1 ? 1 : null })),
    duties: state.duties.map((duty) => ({ id: duty.id, title: duty.title, note: duty.note, studentId: duty.id === 2 ? 3 : null })),
    nextRoleId: state.nextRoleId,
    nextDutyId: state.nextDutyId,
    periods: state.periods,
    scheduleSlots: [{ day: 1, periodId: 3, subject: '数学' }],
    subjects: state.subjects,
    courseGrades: [{ subjectId: 1, studentId: 2, value: 85 }],
    nextPeriodId: state.nextPeriodId,
    nextSubjectId: state.nextSubjectId
  };

  const backup = { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, exportedAt: new Date().toISOString(), data: legacy };
  const json = serializeBackup(backup);
  const result = parseBackup(json);

  assert.equal(result.ok, true);
  assert.equal(result.data.schemaVersion, ROSTER_SCHEMA_VERSION);
  assert.deepEqual(result.data.roles[0].studentIds, [1]);
  assert.deepEqual(result.data.duties[1].studentIds, [3]);
  assert.equal(result.data.scheduleSlots.length, 1);
  assert.equal(result.data.courseGrades[0].value, 85);
  assert.equal(result.data.courseGrades[0].examId, 1);
  assert.equal(result.data.exams[0].title, '考试 1');
  assert.ok(!('studentId' in result.data.roles[0]));
});

test('Schema 4 备份可迁移至当前版本', () => {
  const state = createDefaultRosterState();
  const legacy = {
    schemaVersion: ROSTER_SCHEMA_VERSION_V4,
    students: state.students,
    seats: state.seats,
    assignments: state.assignments,
    activeAssignmentId: state.activeAssignmentId,
    submissions: [],
    scores: [],
    nextAssignmentId: state.nextAssignmentId,
    roles: state.roles,
    duties: state.duties,
    nextRoleId: state.nextRoleId,
    nextDutyId: state.nextDutyId,
    periods: state.periods,
    scheduleSlots: [],
    subjects: state.subjects,
    courseGrades: [{ subjectId: 2, studentId: 1, value: 77 }],
    nextPeriodId: state.nextPeriodId,
    nextSubjectId: state.nextSubjectId
  };

  const backup = { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, exportedAt: new Date().toISOString(), data: legacy };
  const result = parseBackup(serializeBackup(backup));
  assert.equal(result.ok, true);
  assert.equal(result.data.schemaVersion, ROSTER_SCHEMA_VERSION);
  assert.deepEqual(result.data.courseGrades[0], {
    examId: 1,
    subjectId: 2,
    studentId: 1,
    value: 77
  });
});

test('未知备份格式版本被拒绝', () => {
  const backup = createBackup(createDefaultRosterState());
  backup.formatVersion = 99;
  const json = serializeBackup(backup);
  const result = parseBackup(json);
  assert.equal(result.ok, false);
  assert.equal(result.error, '暂不支持此备份版本');
});

test('损坏 JSON 被拒绝', () => {
  const result = parseBackup('{ invalid json ');
  assert.equal(result.ok, false);
  assert.equal(result.error, '无法读取备份文件');
});

test('空字符串被拒绝', () => {
  assert.equal(parseBackup('').ok, false);
  assert.equal(parseBackup('   ').ok, false);
});

test('非对象 JSON 被拒绝', () => {
  assert.equal(parseBackup('null').ok, false);
  assert.equal(parseBackup('"hello"').ok, false);
  assert.equal(parseBackup('123').ok, false);
});

test('缺失字段的备份被拒绝', () => {
  const json = JSON.stringify({ format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION });
  assert.equal(parseBackup(json).ok, false);
});

test('非法引用和数据被拒绝', () => {
  const snapshot = createDefaultRosterState();
  snapshot.seats[0].studentId = 999;
  const backup = createBackup(snapshot);
  const json = serializeBackup(backup);
  const result = parseBackup(json);
  assert.equal(result.ok, false);
});

test('重复记录被拒绝', () => {
  const snapshot = createDefaultRosterState();
  snapshot.submissions.push(
    { assignmentId: 1, studentId: 1 },
    { assignmentId: 1, studentId: 1 }
  );
  const backup = createBackup(snapshot);
  const json = serializeBackup(backup);
  const result = parseBackup(json);
  assert.equal(result.ok, false);
});

test('孤立分数（无对应提交记录）被拒绝', () => {
  const snapshot = createDefaultRosterState();
  snapshot.scores.push({ assignmentId: 1, studentId: 1, value: 80 });
  const backup = createBackup(snapshot);
  const json = serializeBackup(backup);
  const result = parseBackup(json);
  assert.equal(result.ok, false);
});

test('序列化后修改原对象不影响解析结果', () => {
  const original = createDefaultRosterState();
  original.submissions.push({ assignmentId: 1, studentId: 5 });
  const backup = createBackup(original);
  const json = serializeBackup(backup);

  // Mutate original after serialization
  original.submissions.length = 0;
  original.students[0].name = '篡改';

  const result = parseBackup(json);
  assert.equal(result.ok, true);
  assert.equal(result.data.submissions.length, 1);
  assert.equal(result.data.students[0].name, '赵予安');
});

test('generateBackupFilename 返回预期的格式', () => {
  const filename = generateBackupFilename();
  assert.ok(filename.startsWith('teacher-workbench-backup-'));
  assert.ok(filename.endsWith('.json'));
  // Pattern: teacher-workbench-backup-YYYYMMDD-HHmmss.json
  assert.match(filename, /^teacher-workbench-backup-\d{8}-\d{6}\.json$/);
});
