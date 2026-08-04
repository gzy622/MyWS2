import {
  COURSE_TEXT_MAX_LENGTH,
  PERIOD_COUNT,
  PEOPLE_TEXT_MAX_LENGTH,
  ROSTER_SCHEMA_VERSION,
  SEAT_COLUMNS,
  SEAT_ROWS,
  STUDENT_NAME_MAX_LENGTH,
  isScoreValue,
  isValidRosterState,
  parseScore
} from './roster-model.js';
import { MAX_CSV_FILE_SIZE, parseRosterCsv } from './csv-transfer.js';
import {
  MAX_BINARY_FILE_SIZE,
  openBinaryFile,
  shareOrDownloadBytes
} from './text-file-transfer.js';
import {
  XLSX_MIME,
  createXlsxWorkbook,
  readXlsxWorkbook
} from './xlsx-workbook.js';

export const WORKBOOK_FORMAT_VERSION = 3;
export const V2_WORKBOOK_FORMAT_VERSION = 2;
export const LEGACY_WORKBOOK_FORMAT_VERSION = 1;
export const MAX_WORKBOOK_FILE_SIZE = MAX_BINARY_FILE_SIZE;
export const WORKBOOK_SHEET_NAMES = Object.freeze([
  '座位表',
  '作业登记',
  '班干安排',
  '值日安排',
  '课程表',
  '考试成绩'
]);
export const V2_WORKBOOK_SHEET_NAMES = Object.freeze([
  '学生名单',
  '作业登记',
  '人员安排',
  '课程表',
  '考试成绩'
]);
export const LEGACY_WORKBOOK_SHEET_NAMES = Object.freeze([
  '使用说明',
  '学生名单',
  '作业',
  '作业记录',
  '班干',
  '班干安排',
  '值日',
  '值日安排',
  '课表',
  '科目',
  '考试',
  '课程成绩'
]);

const CHECKMARK = '✓';
const STUDENT_COUNT_MARKER = '学生行数量';
const DAY_LABELS = Object.freeze(['星期一', '星期二', '星期三', '星期四', '星期五']);
const SEAT_DIRECTION_LABEL = '讲台方向 ↓（讲台在下方）';
const PODIUM_LABEL = '讲台';
const V3_SEAT_MATRIX_START_ROW = 1;
const V3_SEAT_MATRIX_END_ROW = V3_SEAT_MATRIX_START_ROW + SEAT_ROWS - 1;
const V3_SEAT_PODIUM_ROW = V3_SEAT_MATRIX_END_ROW + 1;
const V3_SEAT_LIST_HEADER_ROW = V3_SEAT_PODIUM_ROW + 2;
const V3_SEAT_LIST_START_ROW = V3_SEAT_LIST_HEADER_ROW + 1;
const V3_SEAT_METADATA_START_COLUMN = 14;
const V3_SEAT_MATRIX_ID_START_COLUMN = 28;
const V3_SEAT_LIST_ID_COLUMN = V3_SEAT_MATRIX_ID_START_COLUMN + SEAT_COLUMNS;
const MEMBER_SEPARATOR = '；';
const MEMBER_ESCAPE = '\\';
const textDecoder = new TextDecoder('utf-8');

const STYLE_READONLY = 4;
const STYLE_CENTER = 5;
const STYLE_WRAP = 6;
const STYLE_GRAY_CENTER = 7;
const STYLE_PALE_BLUE = 8;
const STYLE_SCORE = 9;
const STYLE_GRAY_HEADER = 10;
const STYLE_GROUP_CELL = 11;
const STYLE_GROUP_HEADER = 12;
const STYLE_GROUP_SCORE = 13;

function formatLocalTimestamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${h}${min}${s}`;
}

function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function cellValue(cell) {
  if (cell && typeof cell === 'object' && !Array.isArray(cell) && 'value' in cell) return cell.value;
  return cell;
}

function styled(value, style) {
  return { value, style };
}

function formulaCell(value, formula, style) {
  return { value, formula, style };
}

function readonly(value) {
  return styled(value, STYLE_READONLY);
}

function centered(value) {
  return styled(value, STYLE_CENTER);
}

function scoreCell(value, groupStart = false) {
  return styled(value, groupStart ? STYLE_GROUP_SCORE : STYLE_SCORE);
}

function wrap(value) {
  return styled(value, STYLE_WRAP);
}

function key(...ids) {
  return ids.join(':');
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, item.id), 0);
}

function text(raw) {
  const value = cellValue(raw);
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function rowCell(rows, rowIndex, columnIndex) {
  return rows?.[rowIndex]?.[columnIndex];
}

function rawText(rows, rowIndex, columnIndex) {
  return text(rowCell(rows, rowIndex, columnIndex));
}

function cellRef(rowIndex, columnIndex) {
  return `${columnName(columnIndex)}${rowIndex + 1}`;
}

function workbookError(sheet, rowIndex, columnIndex, message) {
  return { ok: false, error: `${sheet}!${cellRef(rowIndex, columnIndex)}：${message}` };
}

function workbookLevelError(message) {
  return { ok: false, error: `工作簿!A1：${message}` };
}

function isBlankRow(row, start = 0, end = row?.length ?? 0) {
  for (let index = start; index < end; index += 1) {
    if (text(row?.[index]) !== '') return false;
  }
  return true;
}

function hasDataInRange(row, start, end) {
  return !isBlankRow(row, start, end);
}

function validationRange(columnIndex, rowStart, rowEnd) {
  return `${columnName(columnIndex)}${rowStart}:${columnName(columnIndex)}${rowEnd}`;
}

function scoreValidation(columnIndex, rowStart, rowEnd, { allowCheckmark = true } = {}) {
  const reference = `${columnName(columnIndex)}${rowStart}`;
  const scoreFormula = `AND(ISNUMBER(${reference}),${reference}>=0,${reference}<=100,ROUND(${reference},1)=${reference})`;
  const formula = allowCheckmark
    ? `=OR(${reference}="",${reference}="${CHECKMARK}",${scoreFormula})`
    : `=OR(${reference}="",${scoreFormula})`;
  return {
    type: 'custom',
    sqref: validationRange(columnIndex, rowStart, rowEnd),
    formula1: formula,
    error: allowCheckmark
      ? '请输入空白、✓或 0～100 的分数，最多一位小数。'
      : '请输入空白或 0～100 的分数，最多一位小数。'
  };
}

function integerValidation(columnIndex, rowStart, rowEnd, min, max) {
  const reference = `${columnName(columnIndex)}${rowStart}`;
  return {
    type: 'custom',
    sqref: validationRange(columnIndex, rowStart, rowEnd),
    formula1: `=AND(ISNUMBER(${reference}),${reference}>=${min},${reference}<=${max},ROUND(${reference},0)=${reference})`,
    error: `请输入 ${min}～${max} 的整数。`
  };
}

function displayStudentLabels(students) {
  const counts = new Map();
  for (const student of students) counts.set(student.name, (counts.get(student.name) ?? 0) + 1);
  const byId = new Map();
  for (const student of students) {
    const label = counts.get(student.name) > 1
      ? `${student.name}（编号 ${student.id}）`
      : student.name;
    byId.set(student.id, label);
  }
  return { byId, labels: [...byId.values()] };
}

function escapeMemberText(value) {
  return String(value ?? '')
    .replaceAll(MEMBER_ESCAPE, `${MEMBER_ESCAPE}${MEMBER_ESCAPE}`)
    .replaceAll(MEMBER_SEPARATOR, `${MEMBER_ESCAPE}${MEMBER_SEPARATOR}`)
    .replaceAll('（', `${MEMBER_ESCAPE}（`)
    .replaceAll('）', `${MEMBER_ESCAPE}）`);
}

function encodeMemberList(studentIds, studentsById) {
  return studentIds.map((studentId) => {
    const student = studentsById.get(studentId);
    if (!student) return '';
    return `${escapeMemberText(student.name)}（编号 ${student.id}）`;
  }).filter(Boolean).join(MEMBER_SEPARATOR);
}

function encodeMemberIds(studentIds) {
  return studentIds.join('|');
}

function setV3SeatMetadata(row, index, label, value) {
  const labelColumn = V3_SEAT_METADATA_START_COLUMN + index * 2;
  row[labelColumn] = label;
  row[labelColumn + 1] = value;
}

function buildSeatSheet(snapshot) {
  const studentsById = new Map(snapshot.students.map((student) => [student.id, student]));
  const seatsByIndex = new Map(snapshot.seats.map((seat) => [seat.seatIndex, seat]));
  const rows = [];
  const directionRow = Array(V3_SEAT_LIST_ID_COLUMN + 1).fill('');
  directionRow[0] = styled(SEAT_DIRECTION_LABEL, STYLE_GROUP_HEADER);
  setV3SeatMetadata(directionRow, 0, '格式版本', WORKBOOK_FORMAT_VERSION);
  setV3SeatMetadata(directionRow, 1, '数据版本', ROSTER_SCHEMA_VERSION);
  setV3SeatMetadata(directionRow, 2, '座位行数', SEAT_ROWS);
  setV3SeatMetadata(directionRow, 3, '座位列数', SEAT_COLUMNS);
  setV3SeatMetadata(directionRow, 4, '学生数量', snapshot.students.length);
  setV3SeatMetadata(directionRow, 5, '矩阵开始行', V3_SEAT_MATRIX_START_ROW + 1);
  setV3SeatMetadata(directionRow, 6, '名单表头行', V3_SEAT_LIST_HEADER_ROW + 1);
  rows.push(directionRow);

  for (let rowIndex = 0; rowIndex < SEAT_ROWS; rowIndex += 1) {
    const row = Array(V3_SEAT_LIST_ID_COLUMN + 1).fill('');
    for (let columnIndex = 0; columnIndex < SEAT_COLUMNS; columnIndex += 1) {
      const seatIndex = rowIndex * SEAT_COLUMNS + columnIndex;
      const seat = seatsByIndex.get(seatIndex);
      const student = seat ? studentsById.get(seat.studentId) : null;
      row[columnIndex] = centered(student?.name ?? '');
      row[V3_SEAT_MATRIX_ID_START_COLUMN + columnIndex] = seat?.studentId ?? '';
    }
    rows.push(row);
  }

  const podiumRow = Array(V3_SEAT_LIST_ID_COLUMN + 1).fill('');
  podiumRow[0] = styled(PODIUM_LABEL, STYLE_GROUP_HEADER);
  rows.push(podiumRow);
  rows.push(Array(V3_SEAT_LIST_ID_COLUMN + 1).fill(''));

  const listHeader = Array(V3_SEAT_LIST_ID_COLUMN + 1).fill('');
  listHeader[0] = '姓名';
  listHeader[1] = '首字母';
  listHeader[2] = '座位行';
  listHeader[3] = '座位列';
  listHeader[V3_SEAT_LIST_ID_COLUMN] = '学生编号';
  rows.push(listHeader);
  snapshot.students.forEach((student) => {
    const seat = snapshot.seats.find((item) => item.studentId === student.id);
    const row = Array(V3_SEAT_LIST_ID_COLUMN + 1).fill('');
    row[0] = student.name;
    row[1] = student.initial;
    row[2] = Math.floor(seat.seatIndex / SEAT_COLUMNS) + 1;
    row[3] = (seat.seatIndex % SEAT_COLUMNS) + 1;
    row[V3_SEAT_LIST_ID_COLUMN] = student.id;
    rows.push(row);
  });

  const listEndRow = V3_SEAT_LIST_START_ROW + snapshot.students.length;
  const columnStyles = Object.fromEntries([
    ...Array.from({ length: SEAT_COLUMNS }, (_, index) => [index, STYLE_CENTER]),
    [1, STYLE_CENTER],
    [2, STYLE_CENTER],
    [3, STYLE_CENTER]
  ]);
  const widths = Array(V3_SEAT_LIST_ID_COLUMN + 1).fill(12);
  widths[0] = 22;
  widths[1] = 12;
  widths[2] = 12;
  widths[3] = 12;
  return {
    name: '座位表',
    header: true,
    freezeRows: V3_SEAT_LIST_HEADER_ROW + 1,
    autoFilter: { ref: `A${V3_SEAT_LIST_HEADER_ROW + 1}:D${listEndRow}` },
    hiddenColumns: [[V3_SEAT_METADATA_START_COLUMN, V3_SEAT_LIST_ID_COLUMN]],
    columnStyles,
    validations: [
      integerValidation(2, V3_SEAT_LIST_START_ROW + 1, listEndRow, 1, SEAT_ROWS),
      integerValidation(3, V3_SEAT_LIST_START_ROW + 1, listEndRow, 1, SEAT_COLUMNS)
    ],
    widths,
    merges: [`A1:M1`, `A${V3_SEAT_PODIUM_ROW + 1}:M${V3_SEAT_PODIUM_ROW + 1}`],
    comments: [
      { ref: 'A1', text: '讲台在矩阵下方；矩阵按 seatIndex 行优先从第 1 排第 1 列开始，完整保留 8×13 个位置。' },
      { ref: `A${V3_SEAT_LIST_HEADER_ROW + 1}`, text: '矩阵是座位复刻显示区；请在下方名单编辑区修改姓名、首字母和座位行列。学生编号隐藏保存并作为稳定关联主键。' },
      { ref: `B${V3_SEAT_LIST_HEADER_ROW + 1}`, text: '首字母只能填写单个 A～Z 或 #。' },
      { ref: `C${V3_SEAT_LIST_HEADER_ROW + 1}`, text: '座位行只能填写 1～8；座位列只能填写 1～13。' }
    ],
    rows
  };
}

function buildV3PeopleSheet(snapshot, kind) {
  const isRole = kind === 'role';
  const name = isRole ? '班干安排' : '值日安排';
  const items = isRole ? snapshot.roles : snapshot.duties;
  const memberColumn = isRole ? 1 : 2;
  const entityIdColumn = 14;
  const memberIdsColumn = 15;
  const studentsById = new Map(snapshot.students.map((student) => [student.id, student]));
  const rows = [];
  const header = Array(memberIdsColumn + 1).fill('');
  header[0] = isRole ? '班干名称' : '值日名称';
  if (!isRole) header[1] = '说明';
  header[memberColumn] = '成员';
  setMetadata(header, 4, '格式版本', WORKBOOK_FORMAT_VERSION);
  setMetadata(header, 6, '数据版本', ROSTER_SCHEMA_VERSION);
  setMetadata(header, 8, '行数量', items.length);
  setMetadata(header, 10, '学生数量', snapshot.students.length);
  header[entityIdColumn] = isRole ? '班干编号' : '值日编号';
  header[memberIdsColumn] = '成员编号序列';
  rows.push(header);
  for (const item of items) {
    const row = Array(memberIdsColumn + 1).fill('');
    row[0] = item.title;
    if (!isRole) row[1] = item.note;
    row[memberColumn] = encodeMemberList(item.studentIds, studentsById);
    row[entityIdColumn] = item.id;
    row[memberIdsColumn] = encodeMemberIds(item.studentIds);
    rows.push(row);
  }
  const endRow = items.length + 1;
  const widths = Array(memberIdsColumn + 1).fill(12);
  widths[0] = 24;
  if (!isRole) widths[1] = 30;
  widths[memberColumn] = 64;
  return {
    name,
    header: true,
    freezeRows: 1,
    autoFilter: { ref: `A1:${columnName(memberColumn)}${endRow}` },
    hiddenColumns: [[4, memberIdsColumn]],
    widths,
    columnStyles: { [memberColumn]: STYLE_WRAP },
    comments: [
      { ref: `${columnName(memberColumn)}1`, text: `同一行全部成员放在一个单元格，格式为「姓名（编号 n）」并用「${MEMBER_SEPARATOR}」分隔。姓名中的反斜杠、分隔符和括号使用反斜杠转义；编号是稳定学生 ID，重名也不会混淆。留空表示没有成员。` },
      { ref: 'A1', text: `${isRole ? '班干名称' : '值日名称'}和成员单元格可以直接修改；重复成员、未知编号或不完整格式会拒绝整份导入。` }
    ],
    rows
  };
}

function setMetadata(row, column, label, value) {
  row[column] = label;
  row[column + 1] = value;
}

function assignmentValue(assignmentId, studentId, submitted, scores) {
  const item = scores.get(key(assignmentId, studentId));
  if (item !== undefined) return item;
  return submitted.has(key(assignmentId, studentId)) ? CHECKMARK : '';
}

function buildV2StudentSheet(snapshot) {
  const rows = [
    [V2_WORKBOOK_FORMAT_VERSION, ROSTER_SCHEMA_VERSION, '学生编号', '首字母', '姓名', '座位行', '座位列'],
    ...snapshot.students.map((student) => {
      const seat = snapshot.seats.find((item) => item.studentId === student.id);
      return [
        '',
        '',
        student.id,
        student.initial,
        student.name,
        Math.floor(seat.seatIndex / SEAT_COLUMNS) + 1,
        (seat.seatIndex % SEAT_COLUMNS) + 1
      ];
    }),
    [STUDENT_COUNT_MARKER, snapshot.students.length, '', '', '', '', '']
  ];
  return {
    name: '学生名单',
    header: true,
    freezeRows: 1,
    autoFilter: { ref: `E1:G${snapshot.students.length + 1}` },
    hiddenRows: [rows.length - 1],
    hiddenColumns: [0, 1, 2, 3],
    validations: [
      integerValidation(5, 2, snapshot.students.length + 1, 1, SEAT_ROWS),
      integerValidation(6, 2, snapshot.students.length + 1, 1, SEAT_COLUMNS)
    ],
    widths: [10, 10, 12, 10, 22, 12, 12],
    comments: [
      { ref: 'E1', text: '可直接修改姓名、座位行和座位列。学生顺序会成为应用中的名单顺序。' },
      { ref: 'F1', text: '座位行只能填写 1～8。' },
      { ref: 'G1', text: '座位列只能填写 1～13。' }
    ],
    rows
  };
}

function buildAssignmentSheet(snapshot, formatVersion = WORKBOOK_FORMAT_VERSION) {
  const submitted = new Set(snapshot.submissions.map((item) => key(item.assignmentId, item.studentId)));
  const scores = new Map(snapshot.scores.map((item) => [key(item.assignmentId, item.studentId), item.value]));
  const rows = [
    [formatVersion, snapshot.assignments.length, ...snapshot.assignments.map((item) => item.id)],
    [ROSTER_SCHEMA_VERSION, '当前作业', ...snapshot.assignments.map((item) => item.id === snapshot.activeAssignmentId
      ? styled(CHECKMARK, STYLE_PALE_BLUE)
      : formatVersion === WORKBOOK_FORMAT_VERSION ? centered('') : '')],
    [snapshot.students.length, '学生姓名', ...snapshot.assignments.map((item) => styled(item.name, item.id === snapshot.activeAssignmentId ? STYLE_PALE_BLUE : 1))],
    ...snapshot.students.map((student) => [
      student.id,
      readonly(student.name),
      ...snapshot.assignments.map((assignment) => {
        const value = assignmentValue(assignment.id, student.id, submitted, scores);
        if (formatVersion === WORKBOOK_FORMAT_VERSION) return centered(value);
        if (value === CHECKMARK) return centered(value);
        if (value === '') return '';
        return scoreCell(value);
      })
    ])
  ];
  const rowEnd = rows.length;
  const validations = snapshot.assignments.map((_, index) => scoreValidation(index + 2, 4, rowEnd));
  return {
    name: '作业登记',
    header: false,
    freezeRows: 3,
    freezeColumns: 2,
    hiddenRows: [0],
    hiddenColumns: [0],
    autoFilter: { ref: `B3:${columnName(rows[0].length - 1)}${rowEnd}` },
    widths: [12, 22, ...snapshot.assignments.map(() => 16)],
    columnStyles: formatVersion === WORKBOOK_FORMAT_VERSION
      ? Object.fromEntries(snapshot.assignments.map((_, index) => [index + 2, STYLE_CENTER]))
      : undefined,
    validations,
    comments: [
      { ref: 'B2', text: `每项作业的当前作业标记只能有一个 ${CHECKMARK}。` },
      { ref: 'B3', text: `空白表示未交，${CHECKMARK}表示已交但未计分，0～100 表示已交且已有分数，分数最多保留一位小数。` }
    ],
    rows
  };
}

function buildPeopleSheet(snapshot, formatVersion = V2_WORKBOOK_FORMAT_VERSION) {
  const { byId, labels } = displayStudentLabels(snapshot.students);
  const maxMembers = Math.max(
    4,
    ...snapshot.roles.map((item) => item.studentIds.length),
    ...snapshot.duties.map((item) => item.studentIds.length)
  );
  const visibleWidth = 2 + maxMembers;
  const metadataColumn = visibleWidth + 2;
  const listColumn = metadataColumn + maxMembers + 2;
  const roleHeaderIndex = 0;
  const roleStartIndex = 1;
  const dutyHeaderIndex = roleStartIndex + snapshot.roles.length + 1;
  const dutyStartIndex = dutyHeaderIndex + 1;
  const dutyEndIndex = dutyStartIndex + snapshot.duties.length - 1;
  const listStartIndex = Math.max(dutyEndIndex + 2, 1);
  const rowCount = Math.max(dutyEndIndex + 1, listStartIndex + labels.length);
  const makeRow = () => Array(listColumn + 1).fill('');
  const rows = Array.from({ length: rowCount }, makeRow);

  rows[roleHeaderIndex][0] = '班干名称';
  for (let index = 0; index < maxMembers; index += 1) rows[roleHeaderIndex][index + 1] = `成员 ${index + 1}`;
  rows[roleHeaderIndex][metadataColumn] = formatVersion;
  rows[roleHeaderIndex][metadataColumn + 1] = ROSTER_SCHEMA_VERSION;
  rows[roleHeaderIndex][metadataColumn + 2] = snapshot.roles.length;
  rows[roleHeaderIndex][metadataColumn + 3] = snapshot.duties.length;
  rows[roleHeaderIndex][metadataColumn + 4] = maxMembers;

  snapshot.roles.forEach((role, roleIndex) => {
    const row = rows[roleStartIndex + roleIndex];
    row[0] = role.title;
    row[metadataColumn] = role.id;
    role.studentIds.forEach((studentId, memberIndex) => {
      row[memberIndex + 1] = byId.get(studentId) ?? '';
      row[metadataColumn + 1 + memberIndex] = studentId;
    });
  });

  rows[dutyHeaderIndex][0] = '值日名称';
  rows[dutyHeaderIndex][1] = '说明';
  for (let index = 0; index < maxMembers; index += 1) rows[dutyHeaderIndex][index + 2] = `成员 ${index + 1}`;
  snapshot.duties.forEach((duty, dutyIndex) => {
    const row = rows[dutyStartIndex + dutyIndex];
    row[0] = duty.title;
    row[1] = duty.note;
    row[metadataColumn] = duty.id;
    duty.studentIds.forEach((studentId, memberIndex) => {
      row[memberIndex + 2] = byId.get(studentId) ?? '';
      row[metadataColumn + 1 + memberIndex] = studentId;
    });
  });

  labels.forEach((label, index) => {
    rows[listStartIndex + index][listColumn] = label;
  });
  const listRange = `=${columnName(listColumn)}$${listStartIndex + 1}:${columnName(listColumn)}$${listStartIndex + labels.length}`;
  const validations = [];
  for (let index = 0; index < maxMembers; index += 1) {
    validations.push({ type: 'list', sqref: validationRange(index + 1, roleStartIndex + 1, roleStartIndex + snapshot.roles.length), formula1: listRange });
    validations.push({ type: 'list', sqref: validationRange(index + 2, dutyStartIndex + 1, dutyEndIndex + 1), formula1: listRange });
  }
  const hiddenColumns = Array.from({ length: listColumn - visibleWidth + 1 }, (_, index) => visibleWidth + index);
  return {
    name: '人员安排',
    header: true,
    freezeRows: dutyHeaderIndex + 1,
    widths: Array(listColumn + 1).fill(14).map((width, index) => index === 0 ? 18 : index === 1 ? 30 : width),
    hiddenColumns,
    validations,
    rowHeights: { [dutyHeaderIndex]: 24 },
    comments: [
      { ref: 'A1', text: '班干名称和成员格可以直接修改。成员格支持学生姓名下拉选择。' },
      { ref: `A${dutyHeaderIndex + 1}`, text: '值日名称、说明和成员格可以直接修改。' }
    ],
    rows
  };
}

function buildCourseSheet(snapshot, formatVersion = WORKBOOK_FORMAT_VERSION) {
  const schedule = new Map(snapshot.scheduleSlots.map((item) => [key(item.day, item.periodId), item.subject]));
  const rows = [
    ['节次', ...DAY_LABELS, formatVersion, ROSTER_SCHEMA_VERSION, PERIOD_COUNT],
    ...snapshot.periods.map((period) => [
      period.title,
      ...DAY_LABELS.map((_, day) => wrap(schedule.get(key(day, period.id)) ?? '')),
      period.id
    ])
  ];
  return {
    name: '课程表',
    header: true,
    freezeRows: 1,
    freezeColumns: 1,
    hiddenColumns: [6, 7, 8],
    widths: [14, 20, 20, 20, 20, 20, 12, 12, 12],
    comments: [
      { ref: 'A1', text: `固定保留 ${PERIOD_COUNT} 个节次；节次名称可以直接修改。` },
      { ref: 'B1', text: '直接填写科目名称，空白表示未安排。长科目名称会自动换行。' }
    ],
    rows
  };
}

function buildExamSheet(snapshot, formatVersion = WORKBOOK_FORMAT_VERSION) {
  const columns = snapshot.exams.flatMap((exam) => snapshot.subjects.map((subject) => ({ exam, subject })));
  const grades = new Map(snapshot.courseGrades.map((item) => [key(item.examId, item.subjectId, item.studentId), item.value]));
  const metadata = `${snapshot.students.length}|${snapshot.exams.length}|${snapshot.subjects.length}`;
  const firstRow = [formatVersion, '', ...columns.map(({ exam, subject }) => `${exam.id}｜${subject.id}`)];
  const examHeaderRow = [ROSTER_SCHEMA_VERSION, '', ...columns.map(({ exam, subject }, index) => (
    index % snapshot.subjects.length === 0 ? styled(exam.title, index % snapshot.subjects.length === 0 && index > 0 ? STYLE_GROUP_HEADER : STYLE_GROUP_HEADER) : ''
  ))];
  const rows = [
    firstRow,
    examHeaderRow,
    [metadata, '学生姓名', ...columns.map(({ subject }, index) => {
      const examIndex = Math.floor(index / snapshot.subjects.length);
      if (examIndex === 0) return styled(subject.title, 1);
      const firstExamColumn = 2 + (index % snapshot.subjects.length);
      return formulaCell(subject.title, `${columnName(firstExamColumn)}3`, STYLE_GRAY_HEADER);
    })],
    ...snapshot.students.map((student) => [
      student.id,
      readonly(student.name),
      ...columns.map(({ exam, subject }, index) => {
        const value = grades.get(key(exam.id, subject.id, student.id));
        return value == null ? '' : scoreCell(value, index % snapshot.subjects.length === 0);
      })
    ])
  ];
  rows[2][1] = '学生姓名';
  const merges = [];
  snapshot.exams.forEach((exam, examIndex) => {
    const start = 2 + examIndex * snapshot.subjects.length;
    const end = start + snapshot.subjects.length - 1;
    merges.push(`${columnName(start)}2:${columnName(end)}2`);
  });
  return {
    name: '考试成绩',
    header: false,
    freezeRows: 3,
    freezeColumns: 2,
    hiddenRows: [0],
    hiddenColumns: [0],
    autoFilter: { ref: `B3:${columnName(rows[0].length - 1)}${rows.length}` },
    widths: [12, 22, ...columns.map(() => 14)],
    merges,
    validations: columns.map((_, index) => scoreValidation(index + 2, 4, rows.length, { allowCheckmark: false })),
    comments: [
      { ref: 'B3', text: '姓名列只帮助查看，学生编号在隐藏列中用于关联。' },
      { ref: 'C2', text: '考试名称可以直接修改。' },
      { ref: 'C3', text: '第一场考试的科目名称可以修改，后续考试中的同科目标题跟随第一场考试。' }
    ],
    rows
  };
}

export function generateWorkbookFilename(date = new Date()) {
  return `teacher-workbench-data-${formatLocalTimestamp(date)}.xlsx`;
}

export function buildRosterWorkbookSheets(snapshot, { exportedAt = new Date().toISOString() } = {}) {
  if (!isValidRosterState(snapshot)) throw new Error('invalid-roster-state');
  return [
    buildSeatSheet(snapshot),
    buildAssignmentSheet(snapshot, WORKBOOK_FORMAT_VERSION),
    buildV3PeopleSheet(snapshot, 'role'),
    buildV3PeopleSheet(snapshot, 'duty'),
    buildCourseSheet(snapshot, WORKBOOK_FORMAT_VERSION),
    buildExamSheet(snapshot, WORKBOOK_FORMAT_VERSION)
  ].map((sheet) => ({ ...sheet, exportedAt }));
}

export function buildRosterWorkbookSheetsV2(snapshot, { exportedAt = new Date().toISOString() } = {}) {
  if (!isValidRosterState(snapshot)) throw new Error('invalid-roster-state');
  return [
    buildV2StudentSheet(snapshot),
    buildAssignmentSheet(snapshot, V2_WORKBOOK_FORMAT_VERSION),
    buildPeopleSheet(snapshot, V2_WORKBOOK_FORMAT_VERSION),
    buildCourseSheet(snapshot, V2_WORKBOOK_FORMAT_VERSION),
    buildExamSheet(snapshot, V2_WORKBOOK_FORMAT_VERSION)
  ].map((sheet) => ({ ...sheet, exportedAt }));
}

export async function serializeRosterWorkbook(snapshot, options = {}) {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  return createXlsxWorkbook(buildRosterWorkbookSheets(snapshot, { exportedAt }), { createdAt: exportedAt });
}

function requireSheet(workbook, name) {
  const rows = workbook?.get?.(name);
  return rows ? { ok: true, rows } : workbookLevelError(`缺少工作表「${name}」`);
}

function parsePositiveInt(raw, sheet, rowIndex, columnIndex, label) {
  const source = text(raw);
  if (!/^[1-9]\d*$/.test(source)) return workbookError(sheet, rowIndex, columnIndex, `${label}无效`);
  const value = Number(source);
  if (!Number.isSafeInteger(value)) return workbookError(sheet, rowIndex, columnIndex, `${label}无效`);
  return { ok: true, value };
}

function parseLimitedText(raw, sheet, rowIndex, columnIndex, label, { allowBlank = false, maxLength = PEOPLE_TEXT_MAX_LENGTH } = {}) {
  const value = text(raw);
  if (!value && !allowBlank) return workbookError(sheet, rowIndex, columnIndex, `${label}不能为空`);
  if (value.length > maxLength) return workbookError(sheet, rowIndex, columnIndex, `${label}不能超过 ${maxLength} 个字符`);
  return { ok: true, value };
}

function parseMetadataInt(rows, sheet, rowIndex, columnIndex, label) {
  return parsePositiveInt(rowCell(rows, rowIndex, columnIndex), sheet, rowIndex, columnIndex, label);
}

function checkFormatMetadata(rows, sheet, formatPosition, dataPosition, expectedFormat = V2_WORKBOOK_FORMAT_VERSION) {
  const format = parseMetadataInt(rows, sheet, formatPosition[0], formatPosition[1], '格式版本');
  if (!format.ok) return format;
  if (format.value !== expectedFormat) return workbookError(sheet, formatPosition[0], formatPosition[1], '暂不支持此工作簿格式版本');
  const data = parseMetadataInt(rows, sheet, dataPosition[0], dataPosition[1], '数据版本');
  if (!data.ok) return data;
  if (data.value !== ROSTER_SCHEMA_VERSION) return workbookError(sheet, dataPosition[0], dataPosition[1], '暂不支持此数据版本');
  return { ok: true };
}

function requireHeader(rows, sheet, rowIndex, columnIndex, expected) {
  if (rawText(rows, rowIndex, columnIndex) !== expected) return workbookError(sheet, rowIndex, columnIndex, `标题应为「${expected}」`);
  return { ok: true };
}

function parseScoreInput(raw, sheet, rowIndex, columnIndex, { allowCheckmark = true } = {}) {
  const value = text(raw);
  if (!value) return { ok: true, value: null, submitted: false };
  if (value === CHECKMARK) {
    if (!allowCheckmark) return workbookError(sheet, rowIndex, columnIndex, `考试成绩不接受 ${CHECKMARK}，请输入 0～100 的成绩`);
    return { ok: true, value: null, submitted: true };
  }
  const score = parseScore(cellValue(raw));
  if (score === null || !isScoreValue(score)) {
    return workbookError(sheet, rowIndex, columnIndex, allowCheckmark
      ? `请输入 ${CHECKMARK} 或 0～100 的分数，最多一位小数`
      : '请输入 0～100 的成绩，最多一位小数');
  }
  return { ok: true, value: score, submitted: true };
}

function parseStudentsV2(rows) {
  const sheet = '学生名单';
  const metadata = checkFormatMetadata(rows, sheet, [0, 0], [0, 1]);
  if (!metadata.ok) return metadata;
  const markerIndex = rows.findIndex((row, rowIndex) => rowIndex > 0 && rawText(rows, rowIndex, 0) === STUDENT_COUNT_MARKER);
  if (markerIndex < 0) return workbookError(sheet, 1, 0, '缺少隐藏学生行数量');
  const count = parseMetadataInt(rows, sheet, markerIndex, 1, '学生行数量');
  if (!count.ok) return count;
  if (markerIndex !== count.value + 1) return workbookError(sheet, markerIndex, 0, '学生行数量与隐藏记录不一致');
  for (const [column, header] of [[2, '学生编号'], [3, '首字母'], [4, '姓名'], [5, '座位行'], [6, '座位列']]) {
    const result = requireHeader(rows, sheet, 0, column, header);
    if (!result.ok) return result;
  }
  const students = [];
  const seats = [];
  const studentIds = new Set();
  const seatIndexes = new Set();
  for (let index = 0; index < count.value; index += 1) {
    const rowIndex = index + 1;
    if (!hasDataInRange(rows[rowIndex], 2, 7)) return workbookError(sheet, rowIndex, 4, '学生行不能为空');
    const id = parsePositiveInt(rowCell(rows, rowIndex, 2), sheet, rowIndex, 2, '学生编号');
    if (!id.ok) return id;
    if (studentIds.has(id.value)) return workbookError(sheet, rowIndex, 2, '学生编号重复');
    const name = parseLimitedText(rowCell(rows, rowIndex, 4), sheet, rowIndex, 4, '姓名', { maxLength: STUDENT_NAME_MAX_LENGTH });
    if (!name.ok) return name;
    const initial = text(rowCell(rows, rowIndex, 3)).toUpperCase();
    if (!/^[A-Z#]$/.test(initial)) return workbookError(sheet, rowIndex, 3, '首字母无效');
    const seatRow = parsePositiveInt(rowCell(rows, rowIndex, 5), sheet, rowIndex, 5, '座位行');
    if (!seatRow.ok) return seatRow;
    const seatColumn = parsePositiveInt(rowCell(rows, rowIndex, 6), sheet, rowIndex, 6, '座位列');
    if (!seatColumn.ok) return seatColumn;
    if (seatRow.value < 1 || seatRow.value > SEAT_ROWS) return workbookError(sheet, rowIndex, 5, '座位行只能为 1～8');
    if (seatColumn.value < 1 || seatColumn.value > SEAT_COLUMNS) return workbookError(sheet, rowIndex, 6, '座位列只能为 1～13');
    const seatIndex = (seatRow.value - 1) * SEAT_COLUMNS + seatColumn.value - 1;
    if (seatIndexes.has(seatIndex)) return workbookError(sheet, rowIndex, 5, '座位重复');
    studentIds.add(id.value);
    seatIndexes.add(seatIndex);
    students.push({ id: id.value, name: name.value, initial });
    seats.push({ studentId: id.value, seatIndex });
  }
  for (let rowIndex = markerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    if (hasDataInRange(rows[rowIndex], 0, 7)) return workbookError(sheet, rowIndex, 4, '学生行数量与隐藏记录不一致');
  }
  if (!students.length) return workbookError(sheet, 1, 4, '至少需要一名学生');
  return { ok: true, students, seats, studentIds, count: count.value };
}

function parseSeatMetadata(rows, labelIndex, valueLabel, expectedValue) {
  const sheet = '座位表';
  const labelColumn = V3_SEAT_METADATA_START_COLUMN + labelIndex * 2;
  const label = requireHeader(rows, sheet, 0, labelColumn, valueLabel);
  if (!label.ok) return label;
  const parsed = parseMetadataInt(rows, sheet, 0, labelColumn + 1, valueLabel);
  if (!parsed.ok) return parsed;
  if (parsed.value !== expectedValue) return workbookError(sheet, 0, labelColumn + 1, `${valueLabel}应为 ${expectedValue}`);
  return parsed;
}

function parseSeatSheetV3(rows) {
  const sheet = '座位表';
  const direction = requireHeader(rows, sheet, 0, 0, SEAT_DIRECTION_LABEL);
  if (!direction.ok) return direction;
  const format = parseSeatMetadata(rows, 0, '格式版本', WORKBOOK_FORMAT_VERSION);
  if (!format.ok) return format;
  const data = parseSeatMetadata(rows, 1, '数据版本', ROSTER_SCHEMA_VERSION);
  if (!data.ok) return data;
  const seatRows = parseSeatMetadata(rows, 2, '座位行数', SEAT_ROWS);
  if (!seatRows.ok) return seatRows;
  const seatColumns = parseSeatMetadata(rows, 3, '座位列数', SEAT_COLUMNS);
  if (!seatColumns.ok) return seatColumns;
  const studentCount = parseMetadataInt(rows, sheet, 0, V3_SEAT_METADATA_START_COLUMN + 9, '学生数量');
  const studentCountLabel = requireHeader(rows, sheet, 0, V3_SEAT_METADATA_START_COLUMN + 8, '学生数量');
  if (!studentCountLabel.ok) return studentCountLabel;
  if (!studentCount.ok) return studentCount;
  if (studentCount.value < 1 || studentCount.value > SEAT_ROWS * SEAT_COLUMNS) {
    return workbookError(sheet, 0, V3_SEAT_METADATA_START_COLUMN + 9, '学生数量超出座位容量');
  }
  const matrixStart = parseSeatMetadata(rows, 5, '矩阵开始行', V3_SEAT_MATRIX_START_ROW + 1);
  if (!matrixStart.ok) return matrixStart;
  const listHeader = parseSeatMetadata(rows, 6, '名单表头行', V3_SEAT_LIST_HEADER_ROW + 1);
  if (!listHeader.ok) return listHeader;
  if (rawText(rows, V3_SEAT_PODIUM_ROW, 0) !== PODIUM_LABEL) return workbookError(sheet, V3_SEAT_PODIUM_ROW, 0, '矩阵下方必须保留「讲台」');
  for (const [column, header] of [[0, '姓名'], [1, '首字母'], [2, '座位行'], [3, '座位列']]) {
    const result = requireHeader(rows, sheet, V3_SEAT_LIST_HEADER_ROW, column, header);
    if (!result.ok) return result;
  }
  const students = [];
  const seats = [];
  const studentIds = new Set();
  const seatIndexes = new Set();
  for (let index = 0; index < studentCount.value; index += 1) {
    const rowIndex = V3_SEAT_LIST_START_ROW + index;
    if (!hasDataInRange(rows[rowIndex], 0, 4)) return workbookError(sheet, rowIndex, 0, '名单学生行不能为空');
    const id = parsePositiveInt(rowCell(rows, rowIndex, V3_SEAT_LIST_ID_COLUMN), sheet, rowIndex, V3_SEAT_LIST_ID_COLUMN, '学生编号');
    if (!id.ok) return id;
    if (studentIds.has(id.value)) return workbookError(sheet, rowIndex, V3_SEAT_LIST_ID_COLUMN, '学生编号重复');
    const name = parseLimitedText(rowCell(rows, rowIndex, 0), sheet, rowIndex, 0, '姓名', { maxLength: STUDENT_NAME_MAX_LENGTH });
    if (!name.ok) return name;
    const initial = text(rowCell(rows, rowIndex, 1)).toUpperCase();
    if (!/^[A-Z#]$/.test(initial)) return workbookError(sheet, rowIndex, 1, '首字母无效');
    const seatRow = parsePositiveInt(rowCell(rows, rowIndex, 2), sheet, rowIndex, 2, '座位行');
    if (!seatRow.ok) return seatRow;
    const seatColumn = parsePositiveInt(rowCell(rows, rowIndex, 3), sheet, rowIndex, 3, '座位列');
    if (!seatColumn.ok) return seatColumn;
    if (seatRow.value < 1 || seatRow.value > SEAT_ROWS) return workbookError(sheet, rowIndex, 2, '座位行只能为 1～8');
    if (seatColumn.value < 1 || seatColumn.value > SEAT_COLUMNS) return workbookError(sheet, rowIndex, 3, '座位列只能为 1～13');
    const seatIndex = (seatRow.value - 1) * SEAT_COLUMNS + seatColumn.value - 1;
    if (seatIndexes.has(seatIndex)) return workbookError(sheet, rowIndex, 2, '座位重复');
    studentIds.add(id.value);
    seatIndexes.add(seatIndex);
    students.push({ id: id.value, name: name.value, initial });
    seats.push({ studentId: id.value, seatIndex });
  }
  const listEnd = V3_SEAT_LIST_START_ROW + studentCount.value;
  for (let rowIndex = listEnd; rowIndex < rows.length; rowIndex += 1) {
    if (hasDataInRange(rows[rowIndex], 0, 4) || text(rowCell(rows, rowIndex, V3_SEAT_LIST_ID_COLUMN))) {
      return workbookError(sheet, rowIndex, 0, '名单行数量与隐藏记录不一致');
    }
  }
  return { ok: true, students, seats, studentIds, count: studentCount.value };
}

function parseAssignmentSheetV2(rows, studentsInfo, expectedFormat = V2_WORKBOOK_FORMAT_VERSION) {
  const sheet = '作业登记';
  const metadata = checkFormatMetadata(rows, sheet, [0, 0], [1, 0], expectedFormat);
  if (!metadata.ok) return metadata;
  const studentCount = parseMetadataInt(rows, sheet, 2, 0, '学生行数量');
  if (!studentCount.ok) return studentCount;
  if (studentCount.value !== studentsInfo.count) return workbookError(sheet, 2, 0, '学生行数量与学生名单不一致');
  const assignmentCount = parseMetadataInt(rows, sheet, 0, 1, '作业列数量');
  if (!assignmentCount.ok) return assignmentCount;
  const currentHeader = requireHeader(rows, sheet, 1, 1, '当前作业');
  if (!currentHeader.ok) return currentHeader;
  const nameHeader = requireHeader(rows, sheet, 2, 1, '学生姓名');
  if (!nameHeader.ok) return nameHeader;
  const assignments = [];
  const assignmentIds = new Set();
  let activeAssignmentId = null;
  for (let index = 0; index < assignmentCount.value; index += 1) {
    const columnIndex = index + 2;
    const id = parsePositiveInt(rowCell(rows, 0, columnIndex), sheet, 0, columnIndex, '作业编号');
    if (!id.ok) return id;
    if (assignmentIds.has(id.value)) return workbookError(sheet, 0, columnIndex, '作业编号重复');
    const current = rawText(rows, 1, columnIndex);
    if (current !== '' && current !== CHECKMARK) return workbookError(sheet, 1, columnIndex, `当前作业标记只能为空或 ${CHECKMARK}`);
    if (current === CHECKMARK) {
      if (activeAssignmentId !== null) return workbookError(sheet, 1, columnIndex, `当前作业只能有一个 ${CHECKMARK}`);
      activeAssignmentId = id.value;
    }
    const name = parseLimitedText(rowCell(rows, 2, columnIndex), sheet, 2, columnIndex, '作业名称');
    if (!name.ok) return name;
    assignments.push({ id: id.value, name: name.value });
    assignmentIds.add(id.value);
  }
  if (activeAssignmentId === null) return workbookError(sheet, 1, 1, `每项作业中恰有一个 ${CHECKMARK}`);
  const lastColumn = assignmentCount.value + 1;
  for (const rowIndex of [0, 1, 2]) {
    if (hasDataInRange(rows[rowIndex], lastColumn + 1, rows[rowIndex]?.length ?? 0)) return workbookError(sheet, rowIndex, lastColumn + 1, '作业列数量与隐藏记录不一致');
  }
  const submissions = [];
  const scores = [];
  const recordStudents = new Set();
  for (let index = 0; index < studentCount.value; index += 1) {
    const rowIndex = index + 3;
    if (!hasDataInRange(rows[rowIndex], 0, lastColumn + 1)) return workbookError(sheet, rowIndex, 1, '学生行不能为空');
    const student = parsePositiveInt(rowCell(rows, rowIndex, 0), sheet, rowIndex, 0, '学生编号');
    if (!student.ok) return student;
    if (!studentsInfo.studentIds.has(student.value)) return workbookError(sheet, rowIndex, 0, `学生编号 ${student.value} 不存在`);
    if (recordStudents.has(student.value)) return workbookError(sheet, rowIndex, 0, '学生记录重复');
    if (!rawText(rows, rowIndex, 1)) return workbookError(sheet, rowIndex, 1, '学生姓名不能为空');
    recordStudents.add(student.value);
    for (let assignmentIndex = 0; assignmentIndex < assignments.length; assignmentIndex += 1) {
      const columnIndex = assignmentIndex + 2;
      const parsed = parseScoreInput(rowCell(rows, rowIndex, columnIndex), sheet, rowIndex, columnIndex);
      if (!parsed.ok) return parsed;
      if (parsed.submitted) submissions.push({ assignmentId: assignments[assignmentIndex].id, studentId: student.value });
      if (parsed.value !== null) scores.push({ assignmentId: assignments[assignmentIndex].id, studentId: student.value, value: parsed.value });
    }
  }
  if (recordStudents.size !== studentsInfo.count) return workbookError(sheet, 3, 0, '每名学生都必须保留一行');
  for (let rowIndex = studentCount.value + 3; rowIndex < rows.length; rowIndex += 1) {
    if (hasDataInRange(rows[rowIndex], 0, lastColumn + 1)) return workbookError(sheet, rowIndex, 0, '学生行数量与隐藏记录不一致');
  }
  return {
    ok: true,
    assignments,
    activeAssignmentId,
    submissions,
    scores,
    nextAssignmentId: nextId(assignments)
  };
}

function isMemberTokenEscaped(source, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === MEMBER_ESCAPE; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function splitMemberTokens(source) {
  const tokens = [];
  let token = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === MEMBER_ESCAPE) {
      if (index + 1 >= source.length) return { ok: false };
      token += character + source[index + 1];
      index += 1;
      continue;
    }
    if (character === MEMBER_SEPARATOR) {
      if (!token) return { ok: false };
      tokens.push(token);
      token = '';
      continue;
    }
    token += character;
  }
  if (!token) return { ok: false };
  tokens.push(token);
  return { ok: true, tokens };
}

function unescapeMemberText(source) {
  let value = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character !== MEMBER_ESCAPE) {
      value += character;
      continue;
    }
    const next = source[index + 1];
    if (![MEMBER_ESCAPE, MEMBER_SEPARATOR, '（', '）'].includes(next)) return null;
    value += next;
    index += 1;
  }
  return value;
}

function parseMemberList(raw, studentsInfo, sheet, rowIndex, columnIndex) {
  const source = text(raw);
  if (!source) return { ok: true, value: [] };
  const split = splitMemberTokens(source);
  if (!split.ok) return workbookError(sheet, rowIndex, columnIndex, `成员格式无效，请使用「姓名（编号 n）」并用「${MEMBER_SEPARATOR}」分隔`);
  const studentIds = [];
  for (const token of split.tokens) {
    let marker = -1;
    for (let index = 0; index < token.length; index += 1) {
      if (token.startsWith('（编号 ', index) && !isMemberTokenEscaped(token, index)) marker = index;
    }
    if (marker < 0 || !token.endsWith('）')) {
      return workbookError(sheet, rowIndex, columnIndex, `成员格式无效，请使用「姓名（编号 n）」并用「${MEMBER_SEPARATOR}」分隔`);
    }
    const idText = token.slice(marker + '（编号 '.length, -1);
    if (!/^[1-9]\d*$/.test(idText)) return workbookError(sheet, rowIndex, columnIndex, '成员编号无效');
    const studentId = Number(idText);
    if (!Number.isSafeInteger(studentId)) return workbookError(sheet, rowIndex, columnIndex, '成员编号无效');
    const memberName = unescapeMemberText(token.slice(0, marker));
    if (!memberName) return workbookError(sheet, rowIndex, columnIndex, '成员姓名不能为空或转义无效');
    if (!studentsInfo.studentIds.has(studentId)) return workbookError(sheet, rowIndex, columnIndex, `学生编号 ${studentId} 不存在`);
    if (studentIds.includes(studentId)) return workbookError(sheet, rowIndex, columnIndex, '同一行不能重复安排学生');
    studentIds.push(studentId);
  }
  return { ok: true, value: studentIds };
}

function parseHiddenMemberIds(raw, studentsInfo, sheet, rowIndex, columnIndex) {
  const source = text(raw);
  if (!source) return { ok: true, value: [] };
  const ids = [];
  for (const part of source.split('|')) {
    const id = parsePositiveInt(part, sheet, rowIndex, columnIndex, '隐藏成员编号');
    if (!id.ok) return id;
    if (!studentsInfo.studentIds.has(id.value)) return workbookError(sheet, rowIndex, columnIndex, `学生编号 ${id.value} 不存在`);
    if (ids.includes(id.value)) return workbookError(sheet, rowIndex, columnIndex, '隐藏成员编号重复');
    ids.push(id.value);
  }
  return { ok: true, value: ids };
}

function parseV3PeopleSheet(rows, studentsInfo, kind) {
  const isRole = kind === 'role';
  const sheet = isRole ? '班干安排' : '值日安排';
  const memberColumn = isRole ? 1 : 2;
  const entityIdColumn = 14;
  const memberIdsColumn = 15;
  const headers = isRole
    ? [[0, '班干名称'], [1, '成员']]
    : [[0, '值日名称'], [1, '说明'], [2, '成员']];
  for (const [column, header] of headers) {
    const result = requireHeader(rows, sheet, 0, column, header);
    if (!result.ok) return result;
  }
  const metadata = [
    [4, '格式版本', WORKBOOK_FORMAT_VERSION],
    [6, '数据版本', ROSTER_SCHEMA_VERSION]
  ];
  for (const [column, label, expected] of metadata) {
    const labelResult = requireHeader(rows, sheet, 0, column, label);
    if (!labelResult.ok) return labelResult;
    const value = parseMetadataInt(rows, sheet, 0, column + 1, label);
    if (!value.ok) return value;
    if (value.value !== expected) return workbookError(sheet, 0, column + 1, `${label}应为 ${expected}`);
  }
  const countLabel = requireHeader(rows, sheet, 0, 8, '行数量');
  if (!countLabel.ok) return countLabel;
  const count = parseMetadataInt(rows, sheet, 0, 9, '行数量');
  if (!count.ok) return count;
  if (count.value !== rows.length - 1) return workbookError(sheet, Math.min(count.value + 1, rows.length), 0, '行数量与隐藏记录不一致');
  const studentCountLabel = requireHeader(rows, sheet, 0, 10, '学生数量');
  if (!studentCountLabel.ok) return studentCountLabel;
  const studentCount = parseMetadataInt(rows, sheet, 0, 11, '学生数量');
  if (!studentCount.ok) return studentCount;
  if (studentCount.value !== studentsInfo.count) return workbookError(sheet, 0, 11, '学生数量与座位表不一致');
  const entityHeader = requireHeader(rows, sheet, 0, entityIdColumn, isRole ? '班干编号' : '值日编号');
  if (!entityHeader.ok) return entityHeader;
  const memberIdsHeader = requireHeader(rows, sheet, 0, memberIdsColumn, '成员编号序列');
  if (!memberIdsHeader.ok) return memberIdsHeader;
  for (let rowIndex = 0; rowIndex <= count.value; rowIndex += 1) {
    if (hasDataInRange(rows[rowIndex], memberColumn + 1, 4)) {
      return workbookError(sheet, rowIndex, memberColumn + 1, '全部成员必须放在同一个成员单元格');
    }
  }

  const items = [];
  const entityIds = new Set();
  for (let index = 0; index < count.value; index += 1) {
    const rowIndex = index + 1;
    const id = parsePositiveInt(rowCell(rows, rowIndex, entityIdColumn), sheet, rowIndex, entityIdColumn, isRole ? '班干编号' : '值日编号');
    if (!id.ok) return id;
    if (entityIds.has(id.value)) return workbookError(sheet, rowIndex, entityIdColumn, `${isRole ? '班干' : '值日'}编号重复`);
    const title = parseLimitedText(rowCell(rows, rowIndex, 0), sheet, rowIndex, 0, isRole ? '班干名称' : '值日名称');
    if (!title.ok) return title;
    let note = '';
    if (!isRole) {
      const parsedNote = parseLimitedText(rowCell(rows, rowIndex, 1), sheet, rowIndex, 1, '说明', { allowBlank: true });
      if (!parsedNote.ok) return parsedNote;
      note = parsedNote.value;
    }
    const members = parseMemberList(rowCell(rows, rowIndex, memberColumn), studentsInfo, sheet, rowIndex, memberColumn);
    if (!members.ok) return members;
    const hiddenMembers = parseHiddenMemberIds(rowCell(rows, rowIndex, memberIdsColumn), studentsInfo, sheet, rowIndex, memberIdsColumn);
    if (!hiddenMembers.ok) return hiddenMembers;
    entityIds.add(id.value);
    items.push(isRole
      ? { id: id.value, title: title.value, studentIds: members.value }
      : { id: id.value, title: title.value, note, studentIds: members.value });
  }
  return isRole
    ? { ok: true, roles: items, nextRoleId: nextId(items) }
    : { ok: true, duties: items, nextDutyId: nextId(items) };
}

function findPeopleMetadata(rows, expectedFormat = V2_WORKBOOK_FORMAT_VERSION) {
  const row = rows[0] ?? [];
  for (let columnIndex = 0; columnIndex < row.length - 4; columnIndex += 1) {
    if (text(row[columnIndex]) === String(expectedFormat) && text(row[columnIndex + 1]) === String(ROSTER_SCHEMA_VERSION)) {
      return {
        columnIndex,
        roleCount: row[columnIndex + 2],
        dutyCount: row[columnIndex + 3],
        maxMembers: row[columnIndex + 4]
      };
    }
  }
  return null;
}

function resolveMember(raw, hiddenRaw, labels, studentIds, sheet, rowIndex, columnIndex) {
  const display = text(raw);
  if (!display) return { ok: true, value: null };
  const byLabel = labels.byLabel.get(display);
  if (byLabel !== undefined) return { ok: true, value: byLabel };
  const hidden = parsePositiveInt(hiddenRaw, sheet, rowIndex, columnIndex, '成员编号');
  if (hidden.ok && studentIds.has(hidden.value)) return { ok: true, value: hidden.value };
  if (hidden.ok && !studentIds.has(hidden.value)) return workbookError(sheet, rowIndex, columnIndex, `学生编号 ${hidden.value} 不存在`);
  return workbookError(sheet, rowIndex, columnIndex, '请选择学生姓名');
}

function parsePeopleSheetV2(rows, studentsInfo, expectedFormat = V2_WORKBOOK_FORMAT_VERSION) {
  const sheet = '人员安排';
  const metadata = findPeopleMetadata(rows, expectedFormat);
  if (!metadata) return workbookError(sheet, 0, 0, '缺少隐藏版本信息');
  const metadataColumn = metadata.columnIndex;
  const format = parsePositiveInt(rowCell(rows, 0, metadataColumn), sheet, 0, metadataColumn, '格式版本');
  if (!format.ok) return format;
  const dataVersion = parsePositiveInt(rowCell(rows, 0, metadataColumn + 1), sheet, 0, metadataColumn + 1, '数据版本');
  if (!dataVersion.ok) return dataVersion;
  if (format.value !== expectedFormat) return workbookError(sheet, 0, metadataColumn, '暂不支持此工作簿格式版本');
  if (dataVersion.value !== ROSTER_SCHEMA_VERSION) return workbookError(sheet, 0, metadataColumn + 1, '暂不支持此数据版本');
  const roleCount = parsePositiveInt(metadata.roleCount, sheet, 0, metadataColumn + 2, '班干行数量');
  if (!roleCount.ok) return roleCount;
  const dutyCount = parsePositiveInt(metadata.dutyCount, sheet, 0, metadataColumn + 3, '值日行数量');
  if (!dutyCount.ok) return dutyCount;
  const maxMembers = parsePositiveInt(metadata.maxMembers, sheet, 0, metadataColumn + 4, '成员列数量');
  if (!maxMembers.ok) return maxMembers;
  if (maxMembers.value < 4) return workbookError(sheet, 0, metadataColumn + 4, '至少需要 4 个成员列');
  for (let index = 0; index < maxMembers.value; index += 1) {
    const roleHeader = requireHeader(rows, sheet, 0, index + 1, `成员 ${index + 1}`);
    if (!roleHeader.ok) return roleHeader;
  }
  const dutyHeaderIndex = roleCount.value + 2;
  const dutyHeader = requireHeader(rows, sheet, dutyHeaderIndex, 0, '值日名称');
  if (!dutyHeader.ok) return dutyHeader;
  const dutyNoteHeader = requireHeader(rows, sheet, dutyHeaderIndex, 1, '说明');
  if (!dutyNoteHeader.ok) return dutyNoteHeader;
  for (let index = 0; index < maxMembers.value; index += 1) {
    const header = requireHeader(rows, sheet, dutyHeaderIndex, index + 2, `成员 ${index + 1}`);
    if (!header.ok) return header;
  }
  const labelsByStudent = displayStudentLabels(studentsInfo.students);
  const labels = {
    byLabel: new Map([...labelsByStudent.byId].map(([studentId, label]) => [label, studentId]))
  };
  const uniqueNames = new Map();
  for (const student of studentsInfo.students) {
    const current = uniqueNames.get(student.name) ?? [];
    current.push(student.id);
    uniqueNames.set(student.name, current);
  }
  for (const [name, ids] of uniqueNames) if (ids.length === 1) labels.byLabel.set(name, ids[0]);

  const roles = [];
  const roleIds = new Set();
  for (let index = 0; index < roleCount.value; index += 1) {
    const rowIndex = index + 1;
    const id = parsePositiveInt(rowCell(rows, rowIndex, metadataColumn), sheet, rowIndex, metadataColumn, '班干编号');
    if (!id.ok) return id;
    if (roleIds.has(id.value)) return workbookError(sheet, rowIndex, metadataColumn, '班干编号重复');
    const title = parseLimitedText(rowCell(rows, rowIndex, 0), sheet, rowIndex, 0, '班干名称');
    if (!title.ok) return title;
    const studentIds = [];
    for (let memberIndex = 0; memberIndex < maxMembers.value; memberIndex += 1) {
      const member = resolveMember(rowCell(rows, rowIndex, memberIndex + 1), rowCell(rows, rowIndex, metadataColumn + 1 + memberIndex), labels, studentsInfo.studentIds, sheet, rowIndex, memberIndex + 1);
      if (!member.ok) return member;
      if (member.value !== null) {
        if (studentIds.includes(member.value)) return workbookError(sheet, rowIndex, memberIndex + 1, '同一行不能重复安排学生');
        studentIds.push(member.value);
      }
    }
    roleIds.add(id.value);
    roles.push({ id: id.value, title: title.value, studentIds });
  }

  const duties = [];
  const dutyIds = new Set();
  for (let index = 0; index < dutyCount.value; index += 1) {
    const rowIndex = dutyHeaderIndex + 1 + index;
    const id = parsePositiveInt(rowCell(rows, rowIndex, metadataColumn), sheet, rowIndex, metadataColumn, '值日编号');
    if (!id.ok) return id;
    if (dutyIds.has(id.value)) return workbookError(sheet, rowIndex, metadataColumn, '值日编号重复');
    const title = parseLimitedText(rowCell(rows, rowIndex, 0), sheet, rowIndex, 0, '值日名称');
    if (!title.ok) return title;
    const note = parseLimitedText(rowCell(rows, rowIndex, 1), sheet, rowIndex, 1, '说明', { allowBlank: true });
    if (!note.ok) return note;
    const studentIds = [];
    for (let memberIndex = 0; memberIndex < maxMembers.value; memberIndex += 1) {
      const member = resolveMember(rowCell(rows, rowIndex, memberIndex + 2), rowCell(rows, rowIndex, metadataColumn + 1 + memberIndex), labels, studentsInfo.studentIds, sheet, rowIndex, memberIndex + 2);
      if (!member.ok) return member;
      if (member.value !== null) {
        if (studentIds.includes(member.value)) return workbookError(sheet, rowIndex, memberIndex + 2, '同一行不能重复安排学生');
        studentIds.push(member.value);
      }
    }
    dutyIds.add(id.value);
    duties.push({ id: id.value, title: title.value, note: note.value, studentIds });
  }
  const visibleEnd = maxMembers.value + 2;
  const dataEnd = dutyHeaderIndex + dutyCount.value + 1;
  for (let rowIndex = dataEnd; rowIndex < rows.length; rowIndex += 1) {
    if (hasDataInRange(rows[rowIndex], 0, visibleEnd)) return workbookError(sheet, rowIndex, 0, '人员安排行数量与隐藏记录不一致');
  }
  return { ok: true, roles, duties, nextRoleId: nextId(roles), nextDutyId: nextId(duties) };
}

function parseCourseSheetV2(rows, expectedFormat = V2_WORKBOOK_FORMAT_VERSION) {
  const sheet = '课程表';
  const metadata = checkFormatMetadata(rows, sheet, [0, 6], [0, 7], expectedFormat);
  if (!metadata.ok) return metadata;
  const periodCount = parseMetadataInt(rows, sheet, 0, 8, '节次数量');
  if (!periodCount.ok) return periodCount;
  if (periodCount.value !== PERIOD_COUNT) return workbookError(sheet, 0, 8, `必须保留 ${PERIOD_COUNT} 个节次`);
  const headers = ['节次', ...DAY_LABELS];
  for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
    const result = requireHeader(rows, sheet, 0, columnIndex, headers[columnIndex]);
    if (!result.ok) return result;
  }
  const periods = [];
  const periodIds = new Set();
  const scheduleSlots = [];
  for (let index = 0; index < periodCount.value; index += 1) {
    const rowIndex = index + 1;
    const id = parsePositiveInt(rowCell(rows, rowIndex, 6), sheet, rowIndex, 6, '节次编号');
    if (!id.ok) return id;
    if (periodIds.has(id.value)) return workbookError(sheet, rowIndex, 6, '节次编号重复');
    const title = parseLimitedText(rowCell(rows, rowIndex, 0), sheet, rowIndex, 0, '节次名称');
    if (!title.ok) return title;
    periodIds.add(id.value);
    periods.push({ id: id.value, title: title.value });
    for (let day = 0; day < DAY_LABELS.length; day += 1) {
      const subject = parseLimitedText(rowCell(rows, rowIndex, day + 1), sheet, rowIndex, day + 1, '科目名称', { allowBlank: true, maxLength: COURSE_TEXT_MAX_LENGTH });
      if (!subject.ok) return subject;
      if (subject.value) scheduleSlots.push({ day, periodId: id.value, subject: subject.value });
    }
  }
  for (let rowIndex = periodCount.value + 1; rowIndex < rows.length; rowIndex += 1) {
    if (hasDataInRange(rows[rowIndex], 0, 6)) return workbookError(sheet, rowIndex, 0, '节次数量与隐藏记录不一致');
  }
  return { ok: true, periods, scheduleSlots, nextPeriodId: nextId(periods) };
}

function parseExamColumnToken(raw) {
  const value = text(raw);
  const match = value.match(/^([1-9]\d*)[｜|]([1-9]\d*)$/);
  if (!match) return null;
  const examId = Number(match[1]);
  const subjectId = Number(match[2]);
  if (!Number.isSafeInteger(examId) || !Number.isSafeInteger(subjectId)) return null;
  return { examId, subjectId };
}

function parseExamSheetV2(rows, studentsInfo, expectedFormat = V2_WORKBOOK_FORMAT_VERSION) {
  const sheet = '考试成绩';
  const metadata = checkFormatMetadata(rows, sheet, [0, 0], [1, 0], expectedFormat);
  if (!metadata.ok) return metadata;
  const metaText = rawText(rows, 2, 0);
  const metaMatch = metaText.match(/^([1-9]\d*)\|([1-9]\d*)\|([1-9]\d*)$/);
  if (!metaMatch) return workbookError(sheet, 2, 0, '隐藏数量信息无效');
  const studentCount = Number(metaMatch[1]);
  const examCount = Number(metaMatch[2]);
  const subjectCount = Number(metaMatch[3]);
  if (studentCount !== studentsInfo.count) return workbookError(sheet, 2, 0, '学生行数量与学生名单不一致');
  const expectedColumnCount = examCount * subjectCount;
  if (!examCount || !subjectCount || !Number.isSafeInteger(expectedColumnCount)) return workbookError(sheet, 2, 0, '考试或科目数量无效');
  const nameHeader = requireHeader(rows, sheet, 2, 1, '学生姓名');
  if (!nameHeader.ok) return nameHeader;
  const columns = [];
  for (let index = 0; index < expectedColumnCount; index += 1) {
    const columnIndex = index + 2;
    const token = parseExamColumnToken(rowCell(rows, 0, columnIndex));
    if (!token) return workbookError(sheet, 0, columnIndex, '考试编号或科目编号无效');
    columns.push(token);
  }
  const lastColumn = expectedColumnCount + 1;
  if (hasDataInRange(rows[0], lastColumn + 1, rows[0]?.length ?? 0)) return workbookError(sheet, 0, lastColumn + 1, '成绩列数量与隐藏记录不一致');
  const subjectOrder = columns.slice(0, subjectCount).map((item) => item.subjectId);
  const subjectIdSet = new Set(subjectOrder);
  if (subjectIdSet.size !== subjectCount) return workbookError(sheet, 0, 2, '第一场考试的科目编号重复');
  const exams = [];
  const examIdSet = new Set();
  for (let examIndex = 0; examIndex < examCount; examIndex += 1) {
    const startColumn = 2 + examIndex * subjectCount;
    const examId = columns[examIndex * subjectCount].examId;
    if (examIdSet.has(examId)) return workbookError(sheet, 0, startColumn, '考试编号重复或未连续分组');
    examIdSet.add(examId);
    for (let subjectIndex = 0; subjectIndex < subjectCount; subjectIndex += 1) {
      const column = columns[examIndex * subjectCount + subjectIndex];
      if (column.examId !== examId || column.subjectId !== subjectOrder[subjectIndex]) {
        return workbookError(sheet, 0, examIndex * subjectCount + subjectIndex + 2, '考试列和科目列必须保持完整顺序');
      }
    }
    const title = parseLimitedText(rowCell(rows, 1, startColumn), sheet, 1, startColumn, '考试名称');
    if (!title.ok) return title;
    exams.push({ id: examId, title: title.value });
  }
  const subjectTitles = [];
  for (let subjectIndex = 0; subjectIndex < subjectCount; subjectIndex += 1) {
    const columnIndex = 2 + subjectIndex;
    const title = parseLimitedText(rowCell(rows, 2, columnIndex), sheet, 2, columnIndex, '科目名称', { maxLength: COURSE_TEXT_MAX_LENGTH });
    if (!title.ok) return title;
    subjectTitles.push(title.value);
  }
  // 后续考试的同科目标题是查看提示，导入时始终以第一场考试的标题为准。
  const subjects = subjectOrder.map((id, index) => ({ id, title: subjectTitles[index] }));
  const courseGrades = [];
  const recordStudents = new Set();
  for (let index = 0; index < studentCount; index += 1) {
    const rowIndex = index + 3;
    if (!hasDataInRange(rows[rowIndex], 0, lastColumn + 1)) return workbookError(sheet, rowIndex, 1, '学生行不能为空');
    const student = parsePositiveInt(rowCell(rows, rowIndex, 0), sheet, rowIndex, 0, '学生编号');
    if (!student.ok) return student;
    if (!studentsInfo.studentIds.has(student.value)) return workbookError(sheet, rowIndex, 0, `学生编号 ${student.value} 不存在`);
    if (recordStudents.has(student.value)) return workbookError(sheet, rowIndex, 0, '学生记录重复');
    if (!rawText(rows, rowIndex, 1)) return workbookError(sheet, rowIndex, 1, '学生姓名不能为空');
    recordStudents.add(student.value);
    for (let columnIndex = 0; columnIndex < expectedColumnCount; columnIndex += 1) {
      const parsed = parseScoreInput(rowCell(rows, rowIndex, columnIndex + 2), sheet, rowIndex, columnIndex + 2, { allowCheckmark: false });
      if (!parsed.ok) return parsed;
      if (parsed.value !== null) {
        const column = columns[columnIndex];
        courseGrades.push({ examId: column.examId, subjectId: column.subjectId, studentId: student.value, value: parsed.value });
      }
    }
  }
  if (recordStudents.size !== studentsInfo.count) return workbookError(sheet, 3, 0, '每名学生都必须保留一行');
  for (let rowIndex = studentCount + 3; rowIndex < rows.length; rowIndex += 1) {
    if (hasDataInRange(rows[rowIndex], 0, lastColumn + 1)) return workbookError(sheet, rowIndex, 0, '学生行数量与隐藏记录不一致');
  }
  return { ok: true, subjects, exams, courseGrades, nextSubjectId: nextId(subjects), nextExamId: nextId(exams) };
}

export function parseRosterWorkbookSheetsV2(workbook) {
  for (const name of V2_WORKBOOK_SHEET_NAMES) {
    const required = requireSheet(workbook, name);
    if (!required.ok) return required;
  }
  const students = parseStudentsV2(workbook.get('学生名单'));
  if (!students.ok) return students;
  const assignments = parseAssignmentSheetV2(workbook.get('作业登记'), students);
  if (!assignments.ok) return assignments;
  const people = parsePeopleSheetV2(workbook.get('人员安排'), students);
  if (!people.ok) return people;
  const course = parseCourseSheetV2(workbook.get('课程表'));
  if (!course.ok) return course;
  const exams = parseExamSheetV2(workbook.get('考试成绩'), students);
  if (!exams.ok) return exams;
  const data = {
    schemaVersion: ROSTER_SCHEMA_VERSION,
    students: students.students,
    seats: students.seats,
    assignments: assignments.assignments,
    activeAssignmentId: assignments.activeAssignmentId,
    submissions: assignments.submissions,
    scores: assignments.scores,
    nextAssignmentId: assignments.nextAssignmentId,
    roles: people.roles,
    duties: people.duties,
    nextRoleId: people.nextRoleId,
    nextDutyId: people.nextDutyId,
    periods: course.periods,
    scheduleSlots: course.scheduleSlots,
    subjects: exams.subjects,
    exams: exams.exams,
    courseGrades: exams.courseGrades,
    nextPeriodId: course.nextPeriodId,
    nextSubjectId: exams.nextSubjectId,
    nextExamId: exams.nextExamId
  };
  if (!isValidRosterState(data)) return workbookLevelError('工作簿数据格式不正确');
  return { ok: true, data };
}

export function parseRosterWorkbookSheetsV3(workbook) {
  for (const name of WORKBOOK_SHEET_NAMES) {
    const required = requireSheet(workbook, name);
    if (!required.ok) return required;
  }
  const students = parseSeatSheetV3(workbook.get('座位表'));
  if (!students.ok) return students;
  const assignments = parseAssignmentSheetV2(workbook.get('作业登记'), students, WORKBOOK_FORMAT_VERSION);
  if (!assignments.ok) return assignments;
  const roles = parseV3PeopleSheet(workbook.get('班干安排'), students, 'role');
  if (!roles.ok) return roles;
  const duties = parseV3PeopleSheet(workbook.get('值日安排'), students, 'duty');
  if (!duties.ok) return duties;
  const course = parseCourseSheetV2(workbook.get('课程表'), WORKBOOK_FORMAT_VERSION);
  if (!course.ok) return course;
  const exams = parseExamSheetV2(workbook.get('考试成绩'), students, WORKBOOK_FORMAT_VERSION);
  if (!exams.ok) return exams;
  const data = {
    schemaVersion: ROSTER_SCHEMA_VERSION,
    students: students.students,
    seats: students.seats,
    assignments: assignments.assignments,
    activeAssignmentId: assignments.activeAssignmentId,
    submissions: assignments.submissions,
    scores: assignments.scores,
    nextAssignmentId: assignments.nextAssignmentId,
    roles: roles.roles,
    duties: duties.duties,
    nextRoleId: roles.nextRoleId,
    nextDutyId: duties.nextDutyId,
    periods: course.periods,
    scheduleSlots: course.scheduleSlots,
    subjects: exams.subjects,
    exams: exams.exams,
    courseGrades: exams.courseGrades,
    nextPeriodId: course.nextPeriodId,
    nextSubjectId: exams.nextSubjectId,
    nextExamId: exams.nextExamId
  };
  if (!isValidRosterState(data)) return workbookLevelError('工作簿数据格式不正确');
  return { ok: true, data };
}

function hasVersionMarker(workbook, name, labelColumn, valueColumn, expectedFormat) {
  const rows = workbook?.get?.(name);
  return text(rowCell(rows, 0, labelColumn)) === '格式版本'
    && text(rowCell(rows, 0, valueColumn)) === String(expectedFormat);
}

function hasAdjacentVersionMarker(workbook, name, expectedFormat) {
  const rows = workbook?.get?.(name);
  const row = rows?.[0] ?? [];
  return row.some((value, index) => text(value) === String(expectedFormat) && text(row[index + 1]) === String(ROSTER_SCHEMA_VERSION));
}

export function parseRosterWorkbookSheets(workbook) {
  const hasV3Marker = hasVersionMarker(workbook, '座位表', 14, 15, WORKBOOK_FORMAT_VERSION)
    || hasVersionMarker(workbook, '班干安排', 4, 5, WORKBOOK_FORMAT_VERSION)
    || hasVersionMarker(workbook, '值日安排', 4, 5, WORKBOOK_FORMAT_VERSION);
  const hasV2Marker = hasAdjacentVersionMarker(workbook, '学生名单', V2_WORKBOOK_FORMAT_VERSION)
    || hasAdjacentVersionMarker(workbook, '人员安排', V2_WORKBOOK_FORMAT_VERSION);
  const hasV3Name = ['座位表', '班干安排', '值日安排'].some((name) => workbook?.has?.(name));
  const hasV2Name = ['学生名单', '人员安排'].some((name) => workbook?.has?.(name));
  if (hasV3Marker || (hasV3Name && !hasV2Marker)) return parseRosterWorkbookSheetsV3(workbook);
  if (hasV2Marker || hasV2Name) return parseRosterWorkbookSheetsV2(workbook);
  return workbookLevelError('缺少可识别的 v3 或 v2 固定工作表');
}

function legacyError(sheet, rowIndex, message) {
  return { ok: false, error: `工作表「${sheet}」${rowIndex ? `第 ${rowIndex} 行` : ''}：${message}` };
}

function legacyText(raw) {
  if (raw === null || raw === undefined) return '';
  return String(cellValue(raw)).trim();
}

function legacyPositiveInt(raw, label) {
  const source = legacyText(raw);
  if (!/^[1-9]\d*$/.test(source)) return { ok: false, error: `${label}无效` };
  const value = Number(source);
  return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false, error: `${label}无效` };
}

function legacyScore(raw, label) {
  if (legacyText(raw) === '') return { ok: true, value: null };
  const score = parseScore(cellValue(raw));
  return score !== null && isScoreValue(score) ? { ok: true, value: score } : { ok: false, error: `${label}无效` };
}

function legacyHeaderMap(rows, sheetName, required) {
  if (!rows.length || isBlankRow(rows[0])) return legacyError(sheetName, 1, '缺少标题行');
  const headers = rows[0].map(legacyText);
  const indexes = new Map();
  for (let index = 0; index < headers.length; index += 1) {
    if (!headers[index]) continue;
    if (indexes.has(headers[index])) return legacyError(sheetName, 1, `列名重复：${headers[index]}`);
    indexes.set(headers[index], index);
  }
  for (const header of required) if (!indexes.has(header)) return legacyError(sheetName, 1, `缺少列「${header}」`);
  return { ok: true, headers, indexes };
}

function legacyAt(row, indexes, header) {
  const index = indexes.get(header);
  return index == null ? '' : row[index];
}

function legacyYesNo(raw, label, blankIsNo = false) {
  const value = legacyText(raw);
  if (value === '是' || raw === true) return { ok: true, value: true };
  if (value === '否' || raw === false || (blankIsNo && value === '')) return { ok: true, value: false };
  return { ok: false, error: `${label}必须为是或否` };
}

function legacySimpleDefinitions(rows, sheetName, idHeader, nameHeader, noteHeader = '') {
  const header = legacyHeaderMap(rows, sheetName, noteHeader ? [idHeader, nameHeader, noteHeader] : [idHeader, nameHeader]);
  if (!header.ok) return header;
  const items = [];
  const ids = new Set();
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (isBlankRow(row)) continue;
    const id = legacyPositiveInt(legacyAt(row, header.indexes, idHeader), idHeader);
    if (!id.ok) return legacyError(sheetName, index + 1, id.error);
    if (ids.has(id.value)) return legacyError(sheetName, index + 1, `${idHeader}重复`);
    const name = legacyText(legacyAt(row, header.indexes, nameHeader));
    if (!name) return legacyError(sheetName, index + 1, `${nameHeader}不能为空`);
    const item = { id: id.value, title: name };
    if (noteHeader) item.note = legacyText(legacyAt(row, header.indexes, noteHeader));
    ids.add(id.value);
    items.push(item);
  }
  return items.length ? { ok: true, items, ids } : legacyError(sheetName, 0, '至少需要一条数据');
}

function parseLegacyVersionSheet(rows) {
  const values = new Map();
  for (const row of rows) if (row?.length >= 2) values.set(legacyText(row[0]), legacyText(row[1]));
  const format = legacyPositiveInt(values.get('格式版本'), '格式版本');
  if (!format.ok) return legacyError('使用说明', 0, format.error);
  if (format.value !== LEGACY_WORKBOOK_FORMAT_VERSION) return legacyError('使用说明', 0, '暂不支持此工作簿格式版本');
  const data = legacyPositiveInt(values.get('数据版本'), '数据版本');
  if (!data.ok) return legacyError('使用说明', 0, data.error);
  if (data.value !== ROSTER_SCHEMA_VERSION) return legacyError('使用说明', 0, '暂不支持此数据版本');
  return { ok: true };
}

export function parseLegacyRosterWorkbookSheets(workbook) {
  for (const name of LEGACY_WORKBOOK_SHEET_NAMES) {
    const required = workbook?.get?.(name);
    if (!required) return legacyError('', 0, `缺少工作表「${name}」`);
  }
  const version = parseLegacyVersionSheet(workbook.get('使用说明'));
  if (!version.ok) return version;
  const studentRows = workbook.get('学生名单');
  const studentHeader = legacyHeaderMap(studentRows, '学生名单', ['学生编号', '姓名', '首字母', '座位行', '座位列']);
  if (!studentHeader.ok) return studentHeader;
  const students = [];
  const seats = [];
  const studentIds = new Set();
  const seatIndexes = new Set();
  for (let index = 1; index < studentRows.length; index += 1) {
    const row = studentRows[index];
    if (isBlankRow(row)) continue;
    const id = legacyPositiveInt(legacyAt(row, studentHeader.indexes, '学生编号'), '学生编号');
    if (!id.ok) return legacyError('学生名单', index + 1, id.error);
    if (studentIds.has(id.value)) return legacyError('学生名单', index + 1, '学生编号重复');
    const name = legacyText(legacyAt(row, studentHeader.indexes, '姓名'));
    const initial = legacyText(legacyAt(row, studentHeader.indexes, '首字母')).toUpperCase();
    if (!name) return legacyError('学生名单', index + 1, '姓名不能为空');
    if (!/^[A-Z#]$/.test(initial)) return legacyError('学生名单', index + 1, '首字母无效');
    const seatRow = legacyPositiveInt(legacyAt(row, studentHeader.indexes, '座位行'), '座位行');
    const seatColumn = legacyPositiveInt(legacyAt(row, studentHeader.indexes, '座位列'), '座位列');
    if (!seatRow.ok) return legacyError('学生名单', index + 1, seatRow.error);
    if (!seatColumn.ok) return legacyError('学生名单', index + 1, seatColumn.error);
    if (seatRow.value > SEAT_ROWS || seatColumn.value > SEAT_COLUMNS) return legacyError('学生名单', index + 1, '座位超出范围');
    const seatIndex = (seatRow.value - 1) * SEAT_COLUMNS + seatColumn.value - 1;
    if (seatIndexes.has(seatIndex)) return legacyError('学生名单', index + 1, '座位重复');
    studentIds.add(id.value);
    seatIndexes.add(seatIndex);
    students.push({ id: id.value, name, initial });
    seats.push({ studentId: id.value, seatIndex });
  }
  if (!students.length) return legacyError('学生名单', 0, '至少需要一名学生');

  const assignmentRows = workbook.get('作业');
  const assignmentHeader = legacyHeaderMap(assignmentRows, '作业', ['作业编号', '作业名称', '当前作业']);
  if (!assignmentHeader.ok) return assignmentHeader;
  const assignments = [];
  const assignmentIds = new Set();
  let activeAssignmentId = null;
  for (let index = 1; index < assignmentRows.length; index += 1) {
    const row = assignmentRows[index];
    if (isBlankRow(row)) continue;
    const id = legacyPositiveInt(legacyAt(row, assignmentHeader.indexes, '作业编号'), '作业编号');
    if (!id.ok) return legacyError('作业', index + 1, id.error);
    if (assignmentIds.has(id.value)) return legacyError('作业', index + 1, '作业编号重复');
    const name = legacyText(legacyAt(row, assignmentHeader.indexes, '作业名称'));
    if (!name) return legacyError('作业', index + 1, '作业名称不能为空');
    const current = legacyYesNo(legacyAt(row, assignmentHeader.indexes, '当前作业'), '当前作业');
    if (!current.ok) return legacyError('作业', index + 1, current.error);
    if (current.value) {
      if (activeAssignmentId !== null) return legacyError('作业', index + 1, '当前作业只能有一个');
      activeAssignmentId = id.value;
    }
    assignmentIds.add(id.value);
    assignments.push({ id: id.value, name });
  }
  if (!assignments.length) return legacyError('作业', 0, '至少需要一项作业');
  if (activeAssignmentId === null) return legacyError('作业', 0, '需要选择一个当前作业');

  const recordRows = workbook.get('作业记录');
  const recordHeader = legacyHeaderMap(recordRows, '作业记录', ['学生编号', '学生姓名（仅供查看）']);
  if (!recordHeader.ok) return recordHeader;
  const recordColumns = new Map();
  recordHeader.headers.forEach((header, index) => {
    const match = header.match(/^(已交|分数)｜([1-9]\d*)｜/);
    if (!match) return;
    const item = recordColumns.get(Number(match[2])) ?? {};
    item[match[1] === '已交' ? 'submitted' : 'score'] = index;
    recordColumns.set(Number(match[2]), item);
  });
  for (const assignment of assignments) {
    const columns = recordColumns.get(assignment.id);
    if (!columns || columns.submitted == null || columns.score == null) return legacyError('作业记录', 1, `缺少作业编号 ${assignment.id} 的已交或分数列`);
  }
  const submissions = [];
  const scores = [];
  const recordStudents = new Set();
  for (let index = 1; index < recordRows.length; index += 1) {
    const row = recordRows[index];
    if (isBlankRow(row)) continue;
    const student = legacyPositiveInt(legacyAt(row, recordHeader.indexes, '学生编号'), '学生编号');
    if (!student.ok) return legacyError('作业记录', index + 1, student.error);
    if (!studentIds.has(student.value)) return legacyError('作业记录', index + 1, `学生编号 ${student.value} 不存在`);
    if (recordStudents.has(student.value)) return legacyError('作业记录', index + 1, '学生记录重复');
    recordStudents.add(student.value);
    for (const assignment of assignments) {
      const columns = recordColumns.get(assignment.id);
      const submitted = legacyYesNo(row[columns.submitted], '已交', true);
      if (!submitted.ok) return legacyError('作业记录', index + 1, submitted.error);
      const score = legacyScore(row[columns.score], '分数');
      if (!score.ok) return legacyError('作业记录', index + 1, score.error);
      if (!submitted.value && score.value != null) return legacyError('作业记录', index + 1, '未交作业不能填写分数');
      if (submitted.value) submissions.push({ assignmentId: assignment.id, studentId: student.value });
      if (score.value != null) scores.push({ assignmentId: assignment.id, studentId: student.value, value: score.value });
    }
  }
  if (recordStudents.size !== students.length) return legacyError('作业记录', 0, '每名学生都必须保留一行');

  const rolesResult = legacySimpleDefinitions(workbook.get('班干'), '班干', '班干编号', '班干名称');
  if (!rolesResult.ok) return rolesResult;
  const roles = rolesResult.items.map((item) => ({ ...item, studentIds: [] }));
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const roleMemberRows = workbook.get('班干安排');
  const roleMemberHeader = legacyHeaderMap(roleMemberRows, '班干安排', ['班干编号', '学生编号']);
  if (!roleMemberHeader.ok) return roleMemberHeader;
  const roleMemberKeys = new Set();
  for (let index = 1; index < roleMemberRows.length; index += 1) {
    const row = roleMemberRows[index];
    if (isBlankRow(row)) continue;
    const role = legacyPositiveInt(legacyAt(row, roleMemberHeader.indexes, '班干编号'), '班干编号');
    const student = legacyPositiveInt(legacyAt(row, roleMemberHeader.indexes, '学生编号'), '学生编号');
    if (!role.ok) return legacyError('班干安排', index + 1, role.error);
    if (!student.ok) return legacyError('班干安排', index + 1, student.error);
    if (!rolesById.has(role.value)) return legacyError('班干安排', index + 1, `班干编号 ${role.value} 不存在`);
    if (!studentIds.has(student.value)) return legacyError('班干安排', index + 1, `学生编号 ${student.value} 不存在`);
    const memberKey = key(role.value, student.value);
    if (roleMemberKeys.has(memberKey)) return legacyError('班干安排', index + 1, '安排重复');
    roleMemberKeys.add(memberKey);
    rolesById.get(role.value).studentIds.push(student.value);
  }

  const dutiesResult = legacySimpleDefinitions(workbook.get('值日'), '值日', '值日编号', '值日名称', '说明');
  if (!dutiesResult.ok) return dutiesResult;
  const duties = dutiesResult.items.map((item) => ({ ...item, studentIds: [] }));
  const dutiesById = new Map(duties.map((duty) => [duty.id, duty]));
  const dutyMemberRows = workbook.get('值日安排');
  const dutyMemberHeader = legacyHeaderMap(dutyMemberRows, '值日安排', ['值日编号', '学生编号']);
  if (!dutyMemberHeader.ok) return dutyMemberHeader;
  const dutyMemberKeys = new Set();
  for (let index = 1; index < dutyMemberRows.length; index += 1) {
    const row = dutyMemberRows[index];
    if (isBlankRow(row)) continue;
    const duty = legacyPositiveInt(legacyAt(row, dutyMemberHeader.indexes, '值日编号'), '值日编号');
    const student = legacyPositiveInt(legacyAt(row, dutyMemberHeader.indexes, '学生编号'), '学生编号');
    if (!duty.ok) return legacyError('值日安排', index + 1, duty.error);
    if (!student.ok) return legacyError('值日安排', index + 1, student.error);
    if (!dutiesById.has(duty.value)) return legacyError('值日安排', index + 1, `值日编号 ${duty.value} 不存在`);
    if (!studentIds.has(student.value)) return legacyError('值日安排', index + 1, `学生编号 ${student.value} 不存在`);
    const memberKey = key(duty.value, student.value);
    if (dutyMemberKeys.has(memberKey)) return legacyError('值日安排', index + 1, '安排重复');
    dutyMemberKeys.add(memberKey);
    dutiesById.get(duty.value).studentIds.push(student.value);
  }

  const scheduleRows = workbook.get('课表');
  const scheduleHeader = legacyHeaderMap(scheduleRows, '课表', ['节次编号', '节次名称', ...DAY_LABELS]);
  if (!scheduleHeader.ok) return scheduleHeader;
  const periods = [];
  const periodIds = new Set();
  const scheduleSlots = [];
  for (let index = 1; index < scheduleRows.length; index += 1) {
    const row = scheduleRows[index];
    if (isBlankRow(row)) continue;
    const period = legacyPositiveInt(legacyAt(row, scheduleHeader.indexes, '节次编号'), '节次编号');
    if (!period.ok) return legacyError('课表', index + 1, period.error);
    if (periodIds.has(period.value)) return legacyError('课表', index + 1, '节次编号重复');
    const title = legacyText(legacyAt(row, scheduleHeader.indexes, '节次名称'));
    if (!title) return legacyError('课表', index + 1, '节次名称不能为空');
    periodIds.add(period.value);
    periods.push({ id: period.value, title });
    DAY_LABELS.forEach((day, dayIndex) => {
      const subject = legacyText(legacyAt(row, scheduleHeader.indexes, day));
      if (subject) scheduleSlots.push({ day: dayIndex, periodId: period.value, subject });
    });
  }
  if (periods.length !== PERIOD_COUNT) return legacyError('课表', 0, `必须保留 ${PERIOD_COUNT} 个节次`);

  const subjectsResult = legacySimpleDefinitions(workbook.get('科目'), '科目', '科目编号', '科目名称');
  if (!subjectsResult.ok) return subjectsResult;
  const examsResult = legacySimpleDefinitions(workbook.get('考试'), '考试', '考试编号', '考试名称');
  if (!examsResult.ok) return examsResult;
  const subjects = subjectsResult.items;
  const exams = examsResult.items;
  const subjectIds = subjectsResult.ids;
  const examIds = examsResult.ids;
  const gradeRows = workbook.get('课程成绩');
  const gradeHeader = legacyHeaderMap(gradeRows, '课程成绩', ['考试编号', '考试名称（仅供查看）', '学生编号', '学生姓名（仅供查看）']);
  if (!gradeHeader.ok) return gradeHeader;
  const gradeColumns = new Map();
  gradeHeader.headers.forEach((header, index) => {
    const match = header.match(/^成绩｜([1-9]\d*)｜/);
    if (match) gradeColumns.set(Number(match[1]), index);
  });
  for (const subject of subjects) if (!gradeColumns.has(subject.id)) return legacyError('课程成绩', 1, `缺少科目编号 ${subject.id} 的成绩列`);
  const courseGrades = [];
  const gradeRowKeys = new Set();
  for (let index = 1; index < gradeRows.length; index += 1) {
    const row = gradeRows[index];
    if (isBlankRow(row)) continue;
    const exam = legacyPositiveInt(legacyAt(row, gradeHeader.indexes, '考试编号'), '考试编号');
    const student = legacyPositiveInt(legacyAt(row, gradeHeader.indexes, '学生编号'), '学生编号');
    if (!exam.ok) return legacyError('课程成绩', index + 1, exam.error);
    if (!student.ok) return legacyError('课程成绩', index + 1, student.error);
    if (!examIds.has(exam.value)) return legacyError('课程成绩', index + 1, `考试编号 ${exam.value} 不存在`);
    if (!studentIds.has(student.value)) return legacyError('课程成绩', index + 1, `学生编号 ${student.value} 不存在`);
    const rowKey = key(exam.value, student.value);
    if (gradeRowKeys.has(rowKey)) return legacyError('课程成绩', index + 1, '考试与学生组合重复');
    gradeRowKeys.add(rowKey);
    for (const subject of subjects) {
      const score = legacyScore(row[gradeColumns.get(subject.id)], '课程成绩');
      if (!score.ok) return legacyError('课程成绩', index + 1, score.error);
      if (score.value != null) courseGrades.push({ examId: exam.value, subjectId: subject.id, studentId: student.value, value: score.value });
    }
  }
  if (gradeRowKeys.size !== exams.length * students.length) return legacyError('课程成绩', 0, '每场考试与每名学生都必须保留一行');
  const data = {
    schemaVersion: ROSTER_SCHEMA_VERSION,
    students,
    seats,
    assignments,
    activeAssignmentId,
    submissions,
    scores,
    nextAssignmentId: nextId(assignments),
    roles,
    duties,
    nextRoleId: nextId(roles),
    nextDutyId: nextId(duties),
    periods,
    scheduleSlots,
    subjects,
    exams,
    courseGrades,
    nextPeriodId: nextId(periods),
    nextSubjectId: nextId(subjects),
    nextExamId: nextId(exams)
  };
  return isValidRosterState(data) ? { ok: true, data } : legacyError('使用说明', 0, '工作簿数据格式不正确');
}

export async function parseRosterWorkbook(input) {
  try {
    const workbook = await readXlsxWorkbook(input);
    const looksLikeV3 = workbook.has('座位表')
      || hasVersionMarker(workbook, '班干安排', 4, 5, WORKBOOK_FORMAT_VERSION)
      || hasVersionMarker(workbook, '值日安排', 4, 5, WORKBOOK_FORMAT_VERSION);
    const looksLikeV2 = hasAdjacentVersionMarker(workbook, '学生名单', V2_WORKBOOK_FORMAT_VERSION)
      || hasAdjacentVersionMarker(workbook, '人员安排', V2_WORKBOOK_FORMAT_VERSION);
    if (looksLikeV3 || looksLikeV2) return parseRosterWorkbookSheets(workbook);
    if (workbook.has('使用说明') && LEGACY_WORKBOOK_SHEET_NAMES.slice(2).some((name) => workbook.has(name))) {
      return parseLegacyRosterWorkbookSheets(workbook);
    }
    return parseRosterWorkbookSheets(workbook);
  } catch (error) {
    if (error?.message === 'xlsx-compression-unsupported') return { ok: false, error: '当前系统无法解压此工作簿' };
    if (error?.message === 'xlsx-expanded-too-large') return { ok: false, error: '工作簿展开后过大' };
    return { ok: false, error: '无法读取工作簿' };
  }
}

function looksLikeXlsx(bytes, filename = '') {
  if (/\.xlsx$/i.test(filename)) return true;
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function initWorkbookTransfer({ store, showToast, confirm, fileInput, onAfterImport } = {}) {
  let importing = false;
  let exporting = false;

  async function exportWorkbook() {
    if (exporting) return;
    exporting = true;
    try {
      const bytes = await serializeRosterWorkbook(store.getSnapshot());
      const result = await shareOrDownloadBytes(bytes, generateWorkbookFilename(), {
        mimeType: XLSX_MIME,
        shareTitle: '教师工作台数据表格',
        dialogTitle: '导出表格'
      });
      if (result === 'aborted') return;
      showToast(result === 'downloaded' ? '表格已保存' : '表格已导出');
    } catch {
      showToast('导出表格失败');
    } finally {
      exporting = false;
    }
  }

  async function importWorkbook() {
    if (importing) return;
    importing = true;
    try {
      const result = await openBinaryFile(fileInput, {
        accept: '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv',
        maxSize: MAX_WORKBOOK_FILE_SIZE,
        tooLargeError: '表格文件过大',
        readError: '无法读取表格文件'
      });
      if (result.aborted) return;
      if (result.error) {
        showToast(result.error);
        return;
      }
      const bytes = new Uint8Array(result.buffer);
      const isXlsx = looksLikeXlsx(bytes, result.filename);
      if (!isXlsx && bytes.length > MAX_CSV_FILE_SIZE) {
        showToast('CSV 文件过大');
        return;
      }
      const parsed = isXlsx ? await parseRosterWorkbook(bytes) : parseRosterCsv(textDecoder.decode(bytes));
      if (!parsed.ok) {
        showToast(parsed.error);
        return;
      }
      confirm({
        title: '导入表格',
        message: '导入后将替换当前所有业务数据，此操作不可撤销。',
        action: () => {
          const replaceResult = store.replaceSnapshot(parsed.data);
          if (replaceResult === 'replaced') {
            showToast('表格已导入');
            onAfterImport?.();
          } else if (replaceResult === 'persist-failed') {
            showToast('表格导入失败，无法保存');
          } else {
            showToast('表格数据格式不正确');
          }
        }
      });
    } finally {
      importing = false;
    }
  }

  return { exportWorkbook, importWorkbook };
}
