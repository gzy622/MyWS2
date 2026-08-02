import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultRosterState } from '../src/scripts/roster-model.js';
import {
  LEGACY_WORKBOOK_SHEET_NAMES,
  WORKBOOK_FORMAT_VERSION,
  WORKBOOK_SHEET_NAMES,
  buildRosterWorkbookSheets,
  generateWorkbookFilename,
  parseLegacyRosterWorkbookSheets,
  parseRosterWorkbook,
  parseRosterWorkbookSheets,
  serializeRosterWorkbook
} from '../src/scripts/workbook-transfer.js';
import { createXlsxWorkbook, readXlsxWorkbook } from '../src/scripts/xlsx-workbook.js';

function richSnapshot() {
  const state = createDefaultRosterState();
  state.students[0].name = '张三';
  state.students[1].name = '张三';
  state.assignments.push({ id: 2, name: '作业 2' });
  state.activeAssignmentId = 2;
  state.nextAssignmentId = 2;
  state.submissions.push(
    { assignmentId: 1, studentId: 1 },
    { assignmentId: 2, studentId: 2 }
  );
  state.scores.push({ assignmentId: 2, studentId: 2, value: 95.5 });
  state.roles[0].studentIds = [1, 2, 3, 4, 5];
  state.duties[0].studentIds = [3, 4];
  state.scheduleSlots.push(
    { day: 0, periodId: 2, subject: '语文' },
    { day: 4, periodId: 3, subject: '体育' }
  );
  state.exams.push({ id: 2, title: '期中考试' });
  state.nextExamId = 2;
  state.courseGrades.push(
    { examId: 1, subjectId: 1, studentId: 1, value: 88 },
    { examId: 2, subjectId: 2, studentId: 2, value: 76.5 }
  );
  return state;
}

function rawSheets(snapshot) {
  return new Map(buildRosterWorkbookSheets(snapshot).map((sheet) => [
    sheet.name,
    sheet.rows.map((row) => row.map((cell) => (
      cell && typeof cell === 'object' && 'value' in cell ? cell.value : cell
    )))
  ]));
}

function byName(snapshot) {
  return new Map(buildRosterWorkbookSheets(snapshot).map((sheet) => [sheet.name, sheet]));
}

function legacySheets(snapshot) {
  const students = snapshot.students;
  const seats = new Map(snapshot.seats.map((seat) => [seat.studentId, seat]));
  const submitted = new Set(snapshot.submissions.map((item) => `${item.assignmentId}:${item.studentId}`));
  const scores = new Map(snapshot.scores.map((item) => [`${item.assignmentId}:${item.studentId}`, item.value]));
  const grades = new Map(snapshot.courseGrades.map((item) => [`${item.examId}:${item.subjectId}:${item.studentId}`, item.value]));
  const studentRows = [
    ['学生编号', '姓名', '首字母', '座位行', '座位列'],
    ...students.map((student) => {
      const seat = seats.get(student.id);
      return [student.id, student.name, student.initial, Math.floor(seat.seatIndex / 13) + 1, seat.seatIndex % 13 + 1];
    })
  ];
  const assignmentRows = [
    ['作业编号', '作业名称', '当前作业'],
    ...snapshot.assignments.map((item) => [item.id, item.name, item.id === snapshot.activeAssignmentId ? '是' : '否'])
  ];
  const assignmentRecordHeader = ['学生编号', '学生姓名（仅供查看）'];
  for (const assignment of snapshot.assignments) {
    assignmentRecordHeader.push(`已交｜${assignment.id}｜${assignment.name}`, `分数｜${assignment.id}｜${assignment.name}`);
  }
  const assignmentRecordRows = [assignmentRecordHeader, ...students.map((student) => [
    student.id,
    student.name,
    ...snapshot.assignments.flatMap((assignment) => [
      submitted.has(`${assignment.id}:${student.id}`) ? '是' : '否',
      scores.get(`${assignment.id}:${student.id}`) ?? ''
    ])
  ])];
  const roleRows = [['班干编号', '班干名称'], ...snapshot.roles.map((item) => [item.id, item.title])];
  const roleMemberRows = [['班干编号', '班干名称（仅供查看）', '学生编号', '学生姓名（仅供查看）'], ...snapshot.roles.flatMap((role) => role.studentIds.map((studentId) => [role.id, role.title, studentId, students.find((student) => student.id === studentId).name]))];
  const dutyRows = [['值日编号', '值日名称', '说明'], ...snapshot.duties.map((item) => [item.id, item.title, item.note])];
  const dutyMemberRows = [['值日编号', '值日名称（仅供查看）', '学生编号', '学生姓名（仅供查看）'], ...snapshot.duties.flatMap((duty) => duty.studentIds.map((studentId) => [duty.id, duty.title, studentId, students.find((student) => student.id === studentId).name]))];
  const dayLabels = ['星期一', '星期二', '星期三', '星期四', '星期五'];
  const scheduleRows = [['节次编号', '节次名称', ...dayLabels], ...snapshot.periods.map((period) => [period.id, period.title, ...dayLabels.map((_, day) => snapshot.scheduleSlots.find((slot) => slot.day === day && slot.periodId === period.id)?.subject ?? '')])];
  const subjectRows = [['科目编号', '科目名称'], ...snapshot.subjects.map((item) => [item.id, item.title])];
  const examRows = [['考试编号', '考试名称'], ...snapshot.exams.map((item) => [item.id, item.title])];
  const gradeRows = [
    ['考试编号', '考试名称（仅供查看）', '学生编号', '学生姓名（仅供查看）', ...snapshot.subjects.map((subject) => `成绩｜${subject.id}｜${subject.title}`)],
    ...snapshot.exams.flatMap((exam) => students.map((student) => [exam.id, exam.title, student.id, student.name, ...snapshot.subjects.map((subject) => grades.get(`${exam.id}:${subject.id}:${student.id}`) ?? '')]))
  ];
  return [
    { name: '使用说明', rows: [['教师工作台数据工作簿', ''], ['', ''], ['格式版本', 1], ['数据版本', 6]] },
    { name: '学生名单', rows: studentRows },
    { name: '作业', rows: assignmentRows },
    { name: '作业记录', rows: assignmentRecordRows },
    { name: '班干', rows: roleRows },
    { name: '班干安排', rows: roleMemberRows },
    { name: '值日', rows: dutyRows },
    { name: '值日安排', rows: dutyMemberRows },
    { name: '课表', rows: scheduleRows },
    { name: '科目', rows: subjectRows },
    { name: '考试', rows: examRows },
    { name: '课程成绩', rows: gradeRows }
  ];
}

test('完整业务数据可通过五工作表 XLSX 往返', async () => {
  const original = richSnapshot();
  const bytes = await serializeRosterWorkbook(original, { exportedAt: '2026-08-02T00:00:00.000Z' });
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const result = await parseRosterWorkbook(bytes);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.data, original);
});

test('导出严格包含五个固定工作表和五表布局', async () => {
  const state = richSnapshot();
  const sheets = buildRosterWorkbookSheets(state);
  assert.deepEqual(sheets.map((sheet) => sheet.name), WORKBOOK_SHEET_NAMES);
  assert.equal(WORKBOOK_FORMAT_VERSION, 2);
  assert.deepEqual(sheets[0].rows[0].slice(4, 7), ['姓名', '座位行', '座位列']);
  assert.deepEqual(sheets[0].hiddenColumns, [0, 1, 2, 3]);
  assert.deepEqual(sheets[0].validations.map((item) => item.sqref), [`F2:F${state.students.length + 1}`, `G2:G${state.students.length + 1}`]);
  assert.deepEqual(sheets[1].rows[0].slice(2), [1, 2]);
  assert.equal(sheets[1].rows[1][2], '');
  assert.equal(sheets[1].rows[2][1], '学生姓名');
  assert.equal(sheets[1].rows[2][2].value, '作业 1');
  assert.equal(sheets[1].rows[3].length, 4);
  assert.equal(sheets[1].freezeRows, 3);
  assert.equal(sheets[2].rows[0][0], '班干名称');
  assert.equal(sheets[2].rows[6][0], '值日名称');
  assert.equal(sheets[2].freezeRows, 7);
  assert.ok(sheets[2].hiddenColumns.length >= 5);
  assert.deepEqual(sheets[3].rows[0].slice(0, 6), ['节次', '星期一', '星期二', '星期三', '星期四', '星期五']);
  assert.equal(sheets[3].rows.length, 11);
  assert.equal(sheets[4].rows[1][2].value, '考试 1');
  assert.equal(sheets[4].rows[2][1], '学生姓名');
  assert.deepEqual(sheets[4].merges, ['C2:E2', 'F2:H2']);
  assert.equal(sheets[4].freezeRows, 3);

  const workbook = await readXlsxWorkbook(await serializeRosterWorkbook(state));
  assert.deepEqual([...workbook.keys()], WORKBOOK_SHEET_NAMES);
  assert.equal(workbook.get('作业登记').length, state.students.length + 3);
  assert.equal(workbook.get('考试成绩').length, state.students.length + 3);
  assert.deepEqual(workbook.getSheetMeta('作业登记').hiddenRows, [0]);
  assert.deepEqual(workbook.getSheetMeta('作业登记').hiddenColumns, [[0, 0]]);
  assert.deepEqual(workbook.getSheetMeta('考试成绩').merges, ['C2:E2', 'F2:H2']);
  assert.equal(workbook.getSheetMeta('考试成绩').autoFilter, 'B3:H49');
});

test('修改五表中的名称、登记、安排、课表和成绩后可导入', async () => {
  const state = createDefaultRosterState();
  const sheets = byName(state);
  sheets.get('学生名单').rows[1][4] = '修改后的姓名';
  sheets.get('学生名单').rows[1][5] = 3;
  sheets.get('学生名单').rows[1][6] = 7;
  sheets.get('作业登记').rows[2][2] = '单元练习';
  sheets.get('作业登记').rows[3][2] = 89.5;
  sheets.get('人员安排').rows[1][0] = '新班长';
  sheets.get('人员安排').rows[1][1] = '钱书宁';
  sheets.get('人员安排').rows[7][0] = '周一值日';
  sheets.get('人员安排').rows[7][1] = '整理图书角';
  sheets.get('人员安排').rows[7][2] = '孙知远';
  sheets.get('课程表').rows[2][3] = '英语';
  sheets.get('考试成绩').rows[1][2] = '第一次考试';
  sheets.get('考试成绩').rows[2][2] = '语文卷面';
  sheets.get('考试成绩').rows[3][2] = 76.5;

  const result = parseRosterWorkbookSheets(await readXlsxWorkbook(await createXlsxWorkbook([...sheets.values()])));
  assert.equal(result.ok, true, result.error);
  assert.equal(result.data.students[0].name, '修改后的姓名');
  assert.equal(result.data.seats[0].seatIndex, (3 - 1) * 13 + 7 - 1);
  assert.equal(result.data.assignments[0].name, '单元练习');
  assert.deepEqual(result.data.submissions, [{ assignmentId: 1, studentId: 1 }]);
  assert.deepEqual(result.data.scores, [{ assignmentId: 1, studentId: 1, value: 89.5 }]);
  assert.equal(result.data.roles[0].title, '新班长');
  assert.deepEqual(result.data.roles[0].studentIds, [2]);
  assert.equal(result.data.duties[0].title, '周一值日');
  assert.deepEqual(result.data.duties[0].studentIds, [3]);
  assert.deepEqual(result.data.scheduleSlots, [{ day: 2, periodId: 2, subject: '英语' }]);
  assert.equal(result.data.exams[0].title, '第一次考试');
  assert.equal(result.data.subjects[0].title, '语文卷面');
  assert.deepEqual(result.data.courseGrades, [{ examId: 1, subjectId: 1, studentId: 1, value: 76.5 }]);
});

test('重名学生的成员下拉文本和隐藏编号均可恢复', () => {
  const state = createDefaultRosterState();
  state.students[0].name = '李雷';
  state.students[1].name = '李雷';
  state.roles[0].studentIds = [1, 2];
  const sheets = byName(state);
  const people = sheets.get('人员安排');
  assert.equal(people.rows[1][1], '李雷（编号 1）');
  assert.equal(people.rows[1][2], '李雷（编号 2）');
  const result = parseRosterWorkbookSheets(new Map([...sheets].map(([name, sheet]) => [name, sheet.rows])));
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.data.roles[0].studentIds, [1, 2]);
});

test('后续考试的同科目标题跟随第一场考试', () => {
  const state = richSnapshot();
  const sheets = byName(state);
  assert.equal(sheets.get('考试成绩').rows[2][5].formula, 'C3');
  sheets.get('考试成绩').rows[2][2] = '语文改名';
  sheets.get('考试成绩').rows[2][5] = '后续标题不作为来源';
  const result = parseRosterWorkbookSheets(new Map([...sheets].map(([name, sheet]) => [name, sheet.rows])));
  assert.equal(result.ok, true, result.error);
  assert.equal(result.data.subjects[0].title, '语文改名');
});

test('无效字符、删除行列和重复当前作业会指出准确单元格', () => {
  const state = createDefaultRosterState();
  const invalidScore = rawSheets(state);
  invalidScore.get('作业登记')[3][2] = '92.55';
  assert.match(parseRosterWorkbookSheets(invalidScore).error, /^作业登记!C4：/);

  const invalidCheckmark = rawSheets(state);
  invalidCheckmark.get('考试成绩')[3][2] = '✓';
  assert.match(parseRosterWorkbookSheets(invalidCheckmark).error, /^考试成绩!C4：/);

  const duplicateCurrent = rawSheets({ ...state, assignments: [{ id: 1, name: '作业 1' }, { id: 2, name: '作业 2' }], activeAssignmentId: 1, nextAssignmentId: 2 });
  duplicateCurrent.get('作业登记')[1][3] = '✓';
  assert.match(parseRosterWorkbookSheets(duplicateCurrent).error, /^作业登记!D2：/);

  const missingStudent = rawSheets(state);
  missingStudent.get('学生名单').splice(10, 1);
  assert.match(parseRosterWorkbookSheets(missingStudent).error, /^学生名单!A47：/);

  const missingAssignment = rawSheets(state);
  missingAssignment.get('作业登记')[0][2] = '';
  assert.match(parseRosterWorkbookSheets(missingAssignment).error, /^作业登记!C1：/);
});

test('版本 1 的十二工作表 XLSX 仍可读取', async () => {
  const state = createDefaultRosterState();
  const sheets = legacySheets(state);
  assert.deepEqual(sheets.map((sheet) => sheet.name), LEGACY_WORKBOOK_SHEET_NAMES);
  const result = await parseRosterWorkbook(await createXlsxWorkbook(sheets));
  assert.equal(result.ok, true, result.error);
  assert.equal(result.data.students.length, state.students.length);
  assert.equal(result.data.assignments[0].name, state.assignments[0].name);
  assert.equal(result.data.periods.length, 10);
  assert.equal(result.data.exams[0].title, state.exams[0].title);
});

test('generateWorkbookFilename 返回 XLSX 文件名', () => {
  assert.equal(
    generateWorkbookFilename(new Date(2026, 7, 2, 15, 4, 5)),
    'teacher-workbench-data-20260802-150405.xlsx'
  );
});
