import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultRosterState } from '../src/scripts/roster-model.js';
import {
  WORKBOOK_FORMAT_VERSION,
  WORKBOOK_SHEET_NAMES,
  buildRosterWorkbookSheets,
  generateWorkbookFilename,
  parseRosterWorkbook,
  parseRosterWorkbookSheets,
  serializeRosterWorkbook
} from '../src/scripts/workbook-transfer.js';
import { createXlsxWorkbook, readXlsxWorkbook } from '../src/scripts/xlsx-workbook.js';

const cellValue = (cell) => (
  cell && typeof cell === 'object' && !Array.isArray(cell) && 'value' in cell ? cell.value : cell
);

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

function rawSheets(snapshot, build = buildRosterWorkbookSheets) {
  return new Map(build(snapshot).map((sheet) => [
    sheet.name,
    sheet.rows.map((row) => row.map(cellValue))
  ]));
}

function byName(snapshot, build = buildRosterWorkbookSheets) {
  return new Map(build(snapshot).map((sheet) => [sheet.name, sheet]));
}

function seatListRow(sheet, studentId) {
  return sheet.rows.findIndex((row, index) => index >= 12 && cellValue(row[41]) === studentId);
}

test('完整业务数据可通过 v3 六工作表 XLSX 往返', async () => {
  const original = richSnapshot();
  const bytes = await serializeRosterWorkbook(original, { exportedAt: '2026-08-02T00:00:00.000Z' });
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const result = await parseRosterWorkbook(bytes);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.data, original);
});

test('v3 严格生成六表顺序、8×13 座位矩阵和讲台', async () => {
  const state = richSnapshot();
  const sheets = buildRosterWorkbookSheets(state);
  assert.deepEqual(sheets.map((sheet) => sheet.name), WORKBOOK_SHEET_NAMES);
  assert.equal(WORKBOOK_FORMAT_VERSION, 3);

  const seat = sheets[0];
  assert.equal(seat.rows.length, 58);
  assert.equal(cellValue(seat.rows[0][0]), '座位表 · 讲台在下方');
  assert.deepEqual(seat.rows[9].slice(0, 13).map(cellValue), ['讲台', ...Array(12).fill('')]);
  assert.deepEqual(seat.merges, ['A1:M1', 'A10:M10']);
  assert.deepEqual(seat.rows[11].slice(0, 4), ['姓名', '首字母', '座位行', '座位列']);
  assert.deepEqual(seat.hiddenRows, Array.from({ length: 48 }, (_, index) => index + 10));
  assert.ok(seat.hiddenColumns.some((range) => range[0] === 13 && range[1] === 41));
  assert.deepEqual(seat.widths.slice(0, 13), Array(13).fill(5.5));
  assert.equal(seat.printArea, 'A1:M10');
  assert.deepEqual(seat.pageSetup, { paperSize: 9, orientation: 'portrait', fitToWidth: 1, fitToHeight: 1 });

  const studentsById = new Map(state.students.map((student) => [student.id, student]));
  const seatsByIndex = new Map(state.seats.map((item) => [item.seatIndex, item.studentId]));
  let emptyCount = 0;
  for (let row = 0; row < 8; row += 1) {
    assert.equal(seat.rows[row + 1].slice(0, 13).length, 13);
    for (let column = 0; column < 13; column += 1) {
      const seatIndex = row * 13 + column;
      const studentId = seatsByIndex.get(seatIndex);
      const expected = studentId == null ? '' : studentsById.get(studentId).name;
      assert.equal(cellValue(seat.rows[row + 1][column]), expected);
      assert.equal(seat.rows[row + 1][column].style, 14);
      if (!studentId) emptyCount += 1;
    }
  }
  assert.equal(emptyCount, 104 - state.students.length);
  assert.equal(cellValue(seat.rows[12][41]), state.students[0].id);

  const assignment = sheets[1];
  assert.deepEqual(assignment.widths.slice(0, 2), [8, 14]);
  assert.deepEqual(assignment.rows[2].slice(2).map(cellValue), ['作业 1', '作业 2']);
  assert.deepEqual(assignment.rows[3].slice(2).map(cellValue), ['✓', '']);
  assert.deepEqual(assignment.columnStyles, { 2: 5, 3: 5 });
  for (let row = 1; row < assignment.rows.length; row += 1) {
    for (let column = 2; column < 4; column += 1) {
      const cell = assignment.rows[row][column];
      if (cellValue(cell) === '' || cellValue(cell) === null) continue;
      assert.ok([1, 5, 8].includes(cell?.style), `作业登记!${row + 1},${column + 1} 未居中`);
    }
  }

  assert.deepEqual(sheets[4].widths.slice(0, 6), [10, 12, 12, 12, 12, 12]);
  assert.deepEqual(sheets[5].widths.slice(0, 3), [8, 14, 10]);

  const workbook = await readXlsxWorkbook(await serializeRosterWorkbook(state));
  assert.deepEqual([...workbook.keys()], WORKBOOK_SHEET_NAMES);
  assert.deepEqual(workbook.get('座位表').slice(1, 9).map((row) => row.slice(0, 13).length), Array(8).fill(13));
  assert.deepEqual(workbook.getSheetMeta('座位表').hiddenRows, Array.from({ length: 48 }, (_, index) => index + 10));
  assert.equal(workbook.getSheetMeta('座位表').printArea, 'A1:M10');
  assert.deepEqual(workbook.getSheetMeta('座位表').pageSetup, { paperSize: 9, orientation: 'portrait', fitToWidth: 1, fitToHeight: 1 });
  assert.equal(workbook.getSheetMeta('作业登记').columnStyles[2], 5);
  assert.equal(workbook.getSheetMeta('作业登记').columnStyles[3], 5);
});

test('v3 座位表按隐藏稳定 ID 保留重名、改名、首字母和座位移动', () => {
  const state = createDefaultRosterState();
  state.students[0].name = '重名学生';
  state.students[1].name = '重名学生';
  state.roles[0].studentIds = [1, 2];
  state.duties[0].studentIds = [1, 2];
  const sheets = byName(state);
  const seat = sheets.get('座位表');
  const firstRow = seatListRow(seat, 1);
  const emptySeat = [...Array(104).keys()].find((seatIndex) => !state.seats.some((item) => item.seatIndex === seatIndex));
  seat.rows[firstRow][0] = '改名学生';
  seat.rows[firstRow][1] = '#';
  seat.rows[firstRow][2] = Math.floor(emptySeat / 13) + 1;
  seat.rows[firstRow][3] = emptySeat % 13 + 1;

  const result = parseRosterWorkbookSheets(new Map([...sheets].map(([name, sheet]) => [name, sheet.rows])));
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.data.students[0], { id: 1, name: '改名学生', initial: '#' });
  assert.equal(result.data.seats.find((item) => item.studentId === 1).seatIndex, emptySeat);
  assert.deepEqual(result.data.roles[0].studentIds, [1, 2]);
  assert.deepEqual(result.data.duties[0].studentIds, [1, 2]);
});

test('v3 班干和值日拆表，成员单格可读且能处理空成员、重名和特殊字符', () => {
  const state = createDefaultRosterState();
  state.students[0].name = '张；\u005c括号（甲）';
  state.students[1].name = '李雷';
  state.students[2].name = '李雷';
  state.roles[0].studentIds = [1, 2, 3];
  state.duties[0].studentIds = [];
  const sheets = byName(state);
  const role = sheets.get('班干安排');
  const duty = sheets.get('值日安排');
  assert.equal(role.rows[0][0], '班干名称');
  assert.equal(role.rows[0][1], '成员');
  assert.equal(duty.rows[0][0], '值日名称');
  assert.equal(duty.rows[0][1], '说明');
  assert.equal(duty.rows[0][2], '成员');
  assert.doesNotMatch(role.rows[1][1], /编号/);
  assert.match(role.rows[1][1], /张\\；\\\\括号（甲）/);
  assert.match(role.rows[1][1], /；/);
  assert.equal(role.rows[0][2], '');
  assert.equal(duty.rows[1][2], '');
  assert.match(role.comments[0].text, /只显示姓名/);

  const result = parseRosterWorkbookSheets(new Map([...sheets].map(([name, sheet]) => [name, sheet.rows])));
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.data.roles[0].studentIds, [1, 2, 3]);
  assert.deepEqual(result.data.duties[0].studentIds, []);
});

test('v3 成员重复、缺失学生和错误格式指出准确单元格', () => {
  const state = createDefaultRosterState();
  state.roles[0].studentIds = [1, 2];
  const duplicate = byName(state);
  duplicate.get('班干安排').rows[1][1] = `${duplicate.get('班干安排').rows[1][1]}；${duplicate.get('班干安排').rows[1][1].split('；')[0]}`;
  assert.match(parseRosterWorkbookSheets(new Map([...duplicate].map(([name, sheet]) => [name, sheet.rows]))).error, /^班干安排!B2：/);

  const missing = byName(state);
  missing.get('班干安排').rows[1][1] = '不存在';
  assert.match(parseRosterWorkbookSheets(new Map([...missing].map(([name, sheet]) => [name, sheet.rows]))).error, /^班干安排!B2：学生「不存在」不存在/);

  const ambiguous = byName(state);
  ambiguous.get('座位表').rows[12][0] = '同名学生';
  ambiguous.get('座位表').rows[13][0] = '同名学生';
  ambiguous.get('值日安排').rows[1][2] = '同名学生';
  assert.match(parseRosterWorkbookSheets(new Map([...ambiguous].map(([name, sheet]) => [name, sheet.rows]))).error, /^值日安排!C2：学生姓名「同名学生」重名/);

  const splitMembers = byName(state);
  splitMembers.get('班干安排').rows[1][2] = '不应出现的成员列';
  assert.match(parseRosterWorkbookSheets(new Map([...splitMembers].map(([name, sheet]) => [name, sheet.rows]))).error, /^班干安排!C2：/);
});

test('v3 作业状态校验、缺失学生和重复座位拒绝整份文件', () => {
  const state = createDefaultRosterState();
  const invalidScore = rawSheets(state);
  invalidScore.get('作业登记')[3][2] = '92.55';
  assert.match(parseRosterWorkbookSheets(invalidScore).error, /^作业登记!C4：/);

  const duplicateCurrent = rawSheets({
    ...state,
    assignments: [{ id: 1, name: '作业 1' }, { id: 2, name: '作业 2' }],
    activeAssignmentId: 1,
    nextAssignmentId: 2
  });
  duplicateCurrent.get('作业登记')[1][3] = '✓';
  assert.match(parseRosterWorkbookSheets(duplicateCurrent).error, /^作业登记!D2：/);

  const duplicateStudent = rawSheets(state);
  const first = seatListRow({ rows: duplicateStudent.get('座位表') }, 1);
  const second = seatListRow({ rows: duplicateStudent.get('座位表') }, 2);
  duplicateStudent.get('座位表')[second][41] = duplicateStudent.get('座位表')[first][41];
  assert.match(parseRosterWorkbookSheets(duplicateStudent).error, /^座位表!AP\d+：学生编号重复/);

  const duplicateSeat = rawSheets(state);
  duplicateSeat.get('座位表')[second][2] = duplicateSeat.get('座位表')[first][2];
  duplicateSeat.get('座位表')[second][3] = duplicateSeat.get('座位表')[first][3];
  assert.match(parseRosterWorkbookSheets(duplicateSeat).error, /^座位表!C\d+：座位重复/);

  const missingStudent = rawSheets(state);
  missingStudent.get('座位表').splice(13, 1);
  assert.match(parseRosterWorkbookSheets(missingStudent).error, /^座位表!A\d+：名单学生行不能为空/);
});

test('v3 导入忽略个人附加工作表', async () => {
  const state = richSnapshot();
  const v3 = buildRosterWorkbookSheets(state);
  const withPersonal = [...v3, { name: '我的备注', rows: [['仅供查看']] }];
  const v3Result = await parseRosterWorkbook(await createXlsxWorkbook(withPersonal));
  assert.equal(v3Result.ok, true, v3Result.error);
});

test('generateWorkbookFilename 保持 XLSX 文件名', () => {
  assert.equal(
    generateWorkbookFilename(new Date(2026, 7, 2, 15, 4, 5)),
    'teacher-workbench-data-20260802-150405.xlsx'
  );
});
