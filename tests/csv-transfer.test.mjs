import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultRosterState,
  ROSTER_SCHEMA_VERSION,
  SEAT_COLUMNS
} from '../src/scripts/roster-model.js';
import {
  CSV_FORMAT_VERSION,
  CSV_COLUMNS,
  serializeRosterCsv,
  parseRosterCsv,
  generateCsvFilename
} from '../src/scripts/csv-transfer.js';

function richSnapshot() {
  const original = createDefaultRosterState();
  original.students[0].name = '张,三"测试';
  original.students[0].initial = 'Z';
  original.students[1].name = 'Hello\nWorld';
  original.students[1].initial = 'H';
  original.students[2].name = '=SUM(A1)';
  original.students[2].initial = 'S';
  original.assignments.push({ id: 2, name: '作业 2' });
  original.nextAssignmentId = 2;
  original.activeAssignmentId = 2;
  original.submissions.push(
    { assignmentId: 1, studentId: 1 },
    { assignmentId: 2, studentId: 2 }
  );
  original.scores.push({ assignmentId: 2, studentId: 2, value: 95.5 });
  original.roles[0].studentIds = [1, 2];
  original.duties[0].note = '+note';
  original.duties[0].studentIds = [3];
  original.scheduleSlots.push({ day: 0, periodId: 2, subject: '语文,数学' });
  original.courseGrades.push({ examId: 1, subjectId: 1, studentId: 1, value: 88 });
  return original;
}

test('完整业务数据可导出并重新导入', () => {
  const original = richSnapshot();
  const csv = serializeRosterCsv(original, { exportedAt: '2026-08-02T00:00:00.000Z' });
  const result = parseRosterCsv(csv);

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, original);
  assert.notEqual(result.data, original);
});

test('导出包含 BOM、CRLF 与格式版本', () => {
  const csv = serializeRosterCsv(createDefaultRosterState(), {
    exportedAt: '2026-08-02T00:00:00.000Z'
  });
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('\r\n'));
  assert.ok(csv.includes(String(CSV_FORMAT_VERSION)));
  assert.ok(csv.includes(String(ROSTER_SCHEMA_VERSION)));
});

test('中文、逗号、双引号、换行与公式起始字符可安全往返', () => {
  const original = richSnapshot();
  const csv = serializeRosterCsv(original);
  assert.ok(csv.includes('\u200B=SUM(A1)'));
  assert.ok(csv.includes('\u200B+note'));

  const result = parseRosterCsv(csv);
  assert.equal(result.ok, true);
  assert.equal(result.data.students[0].name, '张,三"测试');
  assert.equal(result.data.students[1].name, 'Hello\nWorld');
  assert.equal(result.data.students[2].name, '=SUM(A1)');
  assert.equal(result.data.duties[0].note, '+note');
  assert.equal(result.data.scheduleSlots[0].subject, '语文,数学');
});

test('人工修改后可正确导入', () => {
  const state = createDefaultRosterState();
  const s1 = state.seats.find((seat) => seat.studentId === 1);
  const prev = state.seats.find((seat) => seat.seatIndex === 0);
  if (prev && prev.studentId !== 1) prev.seatIndex = s1.seatIndex;
  s1.seatIndex = 0;
  state.students[0].name = '改名学生';
  state.assignments[0].name = '单元测验';
  state.submissions.push({ assignmentId: 1, studentId: 1 });
  state.roles[0].studentIds = [2];
  state.duties[1].studentIds = [3];
  state.scheduleSlots.push({ day: 2, periodId: 3, subject: '英语' });
  state.courseGrades.push({ examId: 1, subjectId: 2, studentId: 4, value: 76.5 });

  const result = parseRosterCsv(serializeRosterCsv(state));
  assert.equal(result.ok, true);
  assert.equal(result.data.students[0].name, '改名学生');
  assert.equal(result.data.seats.find((seat) => seat.studentId === 1).seatIndex, 0);
  assert.equal(result.data.assignments[0].name, '单元测验');
  assert.equal(result.data.submissions.length, 1);
  assert.deepEqual(result.data.roles[0].studentIds, [2]);
  assert.deepEqual(result.data.duties[1].studentIds, [3]);
  assert.deepEqual(result.data.scheduleSlots[0], { day: 2, periodId: 3, subject: '英语' });
  assert.deepEqual(result.data.courseGrades[0], {
    examId: 1,
    subjectId: 2,
    studentId: 4,
    value: 76.5
  });
});

test('已交但未计分的作业记录可往返', () => {
  const state = createDefaultRosterState();
  state.submissions.push({ assignmentId: 1, studentId: 5 });
  const result = parseRosterCsv(serializeRosterCsv(state));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.submissions, [{ assignmentId: 1, studentId: 5 }]);
  assert.equal(result.data.scores.length, 0);
});

test('支持 LF、列顺序变化、空白行与额外自定义列', () => {
  const state = createDefaultRosterState();
  state.submissions.push({ assignmentId: 1, studentId: 1 });
  state.scores.push({ assignmentId: 1, studentId: 1, value: 90 });

  const withoutBom = serializeRosterCsv(state).slice(1);
  const lf = withoutBom.replace(/\r\n/g, '\n');
  const parsedRows = parseCsvLike(lf);
  const header = CSV_COLUMNS.slice().reverse();
  const dataRows = parsedRows.slice(1).filter((row) => row.some((cell) => cell.trim()));

  const rebuilt = [
    [...header, '自定义列'].join(','),
    '',
    ...dataRows.map((row) => {
      const map = Object.fromEntries(CSV_COLUMNS.map((name, index) => [name, row[index] ?? '']));
      return [...header.map((name) => quoteIfNeeded(map[name])), 'extra'].join(',');
    })
  ].join('\n');

  const result = parseRosterCsv(rebuilt);
  assert.equal(result.ok, true);
  assert.equal(result.data.scores[0].value, 90);
});

test('缺失列、重复列、损坏引号、未知版本与未知类型被拒绝', () => {
  const good = serializeRosterCsv(createDefaultRosterState());
  assert.equal(parseRosterCsv(good.replace('记录类型,', '记录类型X,')).ok, false);

  const dupHeader = `${CSV_COLUMNS.join(',')},记录类型\r\n`;
  assert.equal(parseRosterCsv(dupHeader).ok, false);
  assert.match(parseRosterCsv(dupHeader).error, /列名重复/);

  assert.equal(parseRosterCsv('记录类型,"未闭合\n').ok, false);

  const metaBad = buildMinimalCsv({ formatVersion: 99 });
  assert.equal(parseRosterCsv(metaBad).ok, false);
  assert.match(parseRosterCsv(metaBad).error, /暂不支持此 CSV 格式版本/);

  const unknown = parseRosterCsv(good.replace('\r\n学生,', '\r\n未知类型,'));
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /未知记录类型/);
});

test('无效关联、重复座位、无效分数与多个当前作业被拒绝', () => {
  const withBadMember = appendRecord(serializeRosterCsv(createDefaultRosterState()), {
    '记录类型': '班干成员',
    '班干编号': '1',
    '学生编号': '999'
  });
  const badMember = parseRosterCsv(withBadMember);
  assert.equal(badMember.ok, false);
  assert.match(badMember.error, /学生编号 999 不存在/);

  const state = createDefaultRosterState();
  const row = Math.floor(state.seats[0].seatIndex / SEAT_COLUMNS) + 1;
  const col = (state.seats[0].seatIndex % SEAT_COLUMNS) + 1;
  const forced = setStudentSeat(serializeRosterCsv(state), 2, row, col);
  const dupSeat = parseRosterCsv(forced);
  assert.equal(dupSeat.ok, false);
  assert.match(dupSeat.error, /座位重复/);

  const multiState = createDefaultRosterState();
  multiState.assignments.push({ id: 2, name: '作业 2' });
  multiState.nextAssignmentId = 2;
  const multi = parseRosterCsv(setAssignmentCurrent(serializeRosterCsv(multiState), 2, true));
  assert.equal(multi.ok, false);
  assert.match(multi.error, /当前作业只能有一个/);

  const badScore = appendRecord(serializeRosterCsv(createDefaultRosterState()), {
    '记录类型': '作业记录',
    '作业编号': '1',
    '学生编号': '1',
    '已交': '是',
    '作业分数': '101'
  });
  const scoreResult = parseRosterCsv(badScore);
  assert.equal(scoreResult.ok, false);
  assert.match(scoreResult.error, /作业分数无效/);
});

test('缺少必需记录时拒绝整份文件', () => {
  assert.match(parseRosterCsv(buildMinimalCsv({ omitStudents: true })).error, /缺少学生/);
  assert.match(parseRosterCsv(buildMinimalCsv({ omitActive: true })).error, /缺少当前作业/);
  assert.match(parseRosterCsv(buildMinimalCsv({ periodCount: 9 })).error, /节次/);
});

test('实体顺序决定名单与作业顺序', () => {
  const state = createDefaultRosterState();
  state.students = [
    { id: 2, name: '乙', initial: 'Y' },
    { id: 1, name: '甲', initial: 'J' }
  ];
  state.seats = [
    { studentId: 2, seatIndex: 0 },
    { studentId: 1, seatIndex: 1 }
  ];
  state.assignments = [
    { id: 2, name: '后作业' },
    { id: 1, name: '前作业' }
  ];
  state.activeAssignmentId = 1;
  state.nextAssignmentId = 2;

  const result = parseRosterCsv(serializeRosterCsv(state));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.students.map((s) => s.id), [2, 1]);
  assert.deepEqual(result.data.assignments.map((a) => a.id), [2, 1]);
});

test('generateCsvFilename 返回预期格式', () => {
  const filename = generateCsvFilename(new Date(2026, 7, 2, 15, 4, 5));
  assert.equal(filename, 'teacher-workbench-data-20260802-150405.csv');
});

function quoteIfNeeded(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseCsvLike(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (ch === '\r') continue;
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function emptyCells() {
  return Object.fromEntries(CSV_COLUMNS.map((column) => [column, '']));
}

function appendRecord(csv, fields) {
  const row = emptyCells();
  Object.assign(row, fields);
  const line = CSV_COLUMNS.map((column) => quoteIfNeeded(row[column])).join(',');
  const base = csv.endsWith('\r\n') ? csv.slice(0, -2) : csv.replace(/\n$/, '');
  return `${base}\r\n${line}\r\n`;
}

function mapDataLines(csv, mapper) {
  const body = csv.replace(/^\uFEFF/, '');
  const lines = body.split(/\r\n/);
  const header = parseCsvLike(lines[0])[0];
  const next = lines.map((line, index) => {
    if (index === 0 || !line) return line;
    const cells = parseCsvLike(line)[0];
    while (cells.length < header.length) cells.push('');
    return mapper(cells, header).map(quoteIfNeeded).join(',');
  });
  return `\uFEFF${next.join('\r\n')}`;
}

function setStudentSeat(csv, studentId, row, col) {
  return mapDataLines(csv, (cells, header) => {
    const typeIdx = header.indexOf('记录类型');
    const idIdx = header.indexOf('编号');
    const rowIdx = header.indexOf('座位行');
    const colIdx = header.indexOf('座位列');
    if (cells[typeIdx] === '学生' && cells[idIdx] === String(studentId)) {
      cells[rowIdx] = String(row);
      cells[colIdx] = String(col);
    }
    return cells;
  });
}

function setAssignmentCurrent(csv, assignmentId, current) {
  return mapDataLines(csv, (cells, header) => {
    const typeIdx = header.indexOf('记录类型');
    const idIdx = header.indexOf('编号');
    const activeIdx = header.indexOf('当前作业');
    if (cells[typeIdx] === '作业' && cells[idIdx] === String(assignmentId)) {
      cells[activeIdx] = current ? '是' : '否';
    }
    return cells;
  });
}

function buildMinimalCsv({
  formatVersion = CSV_FORMAT_VERSION,
  omitStudents = false,
  omitActive = false,
  periodCount = 10
} = {}) {
  const rows = [];
  const push = (fields) => {
    const row = emptyCells();
    Object.assign(row, fields);
    rows.push(row);
  };

  push({
    '记录类型': '文件信息',
    '格式版本': String(formatVersion),
    '数据版本': String(ROSTER_SCHEMA_VERSION),
    '导出时间': '2026-08-02T00:00:00.000Z'
  });

  if (!omitStudents) {
    push({
      '记录类型': '学生',
      '编号': '1',
      '名称': '测试生',
      '首字母': 'C',
      '座位行': '1',
      '座位列': '1'
    });
  }

  push({
    '记录类型': '作业',
    '编号': '1',
    '名称': '作业 1',
    '当前作业': omitActive ? '否' : '是'
  });

  push({ '记录类型': '班干', '编号': '1', '名称': '班长' });
  push({ '记录类型': '值日', '编号': '1', '名称': '周一', '说明': '' });

  for (let i = 1; i <= periodCount; i += 1) {
    push({ '记录类型': '节次', '编号': String(i), '名称': String(i) });
  }

  push({ '记录类型': '科目', '编号': '1', '名称': '语文' });
  push({ '记录类型': '考试', '编号': '1', '名称': '考试 1' });

  const lines = [
    CSV_COLUMNS.join(','),
    ...rows.map((row) => CSV_COLUMNS.map((column) => quoteIfNeeded(row[column])).join(','))
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
