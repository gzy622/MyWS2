import {
  SEAT_COLUMNS,
  SEAT_ROWS,
  SEAT_COUNT,
  PERIOD_COUNT,
  ROSTER_SCHEMA_VERSION,
  cloneRosterState,
  isValidRosterState,
  isScoreValue,
  parseScore
} from './roster-model.js';
import {
  openTextFile,
  shareOrDownloadText,
  MAX_TEXT_FILE_SIZE
} from './text-file-transfer.js';

export const CSV_FORMAT_VERSION = 1;
export { MAX_TEXT_FILE_SIZE as MAX_CSV_FILE_SIZE };

export const CSV_COLUMNS = Object.freeze([
  '记录类型',
  '编号',
  '名称',
  '说明',
  '学生编号',
  '学生姓名（仅供查看）',
  '首字母',
  '座位行',
  '座位列',
  '作业编号',
  '作业名称（仅供查看）',
  '当前作业',
  '已交',
  '作业分数',
  '班干编号',
  '班干名称（仅供查看）',
  '值日编号',
  '值日名称（仅供查看）',
  '星期',
  '节次编号',
  '节次名称（仅供查看）',
  '课表科目',
  '科目编号',
  '科目名称（仅供查看）',
  '考试编号',
  '考试名称（仅供查看）',
  '课程成绩',
  '格式版本',
  '数据版本',
  '导出时间'
]);

const RECORD_TYPES = Object.freeze([
  '文件信息',
  '学生',
  '作业',
  '作业记录',
  '班干',
  '班干成员',
  '值日',
  '值日成员',
  '节次',
  '课表',
  '科目',
  '考试',
  '课程成绩'
]);

const DAY_LABELS = Object.freeze(['星期一', '星期二', '星期三', '星期四', '星期五']);
const FORMULA_GUARD = '\u200B';
const YES = '是';
const NO = '否';

function emptyRow() {
  return Object.fromEntries(CSV_COLUMNS.map((column) => [column, '']));
}

function seatIndexToRowCol(seatIndex) {
  return {
    row: Math.floor(seatIndex / SEAT_COLUMNS) + 1,
    col: (seatIndex % SEAT_COLUMNS) + 1
  };
}

function rowColToSeatIndex(row, col) {
  return (row - 1) * SEAT_COLUMNS + (col - 1);
}

function formatLocalTimestamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${h}${min}${s}`;
}

/**
 * Generate a standard CSV filename with local date-time stamp.
 */
export function generateCsvFilename(date = new Date()) {
  return `teacher-workbench-data-${formatLocalTimestamp(date)}.csv`;
}

function needsFormulaGuard(text) {
  return text.startsWith('=')
    || text.startsWith('+')
    || text.startsWith('-')
    || text.startsWith('@')
    || text.startsWith('\t')
    || text.startsWith('\r');
}

function guardFormula(value) {
  if (value === '' || value == null) return '';
  const text = String(value);
  return needsFormulaGuard(text) ? FORMULA_GUARD + text : text;
}

function unguardFormula(value) {
  if (typeof value !== 'string') return '';
  return value.startsWith(FORMULA_GUARD) ? value.slice(FORMULA_GUARD.length) : value;
}

function escapeCsvCell(value) {
  const text = guardFormula(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeCsvRows(rows) {
  const lines = [
    CSV_COLUMNS.join(','),
    ...rows.map((row) => CSV_COLUMNS.map((column) => escapeCsvCell(row[column] ?? '')).join(','))
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function yesNo(value) {
  return value ? YES : NO;
}

/**
 * Serialize a roster snapshot to a UTF-8 BOM, comma-separated, CRLF CSV string.
 */
export function serializeRosterCsv(snapshot, { exportedAt = new Date().toISOString() } = {}) {
  const state = cloneRosterState(snapshot);
  const studentsById = new Map(state.students.map((student) => [student.id, student]));
  const seatsByStudentId = new Map(state.seats.map((seat) => [seat.studentId, seat]));
  const assignmentsById = new Map(state.assignments.map((item) => [item.id, item]));
  const periodsById = new Map(state.periods.map((item) => [item.id, item]));
  const subjectsById = new Map(state.subjects.map((item) => [item.id, item]));
  const examsById = new Map(state.exams.map((item) => [item.id, item]));
  const scoreByKey = new Map(
    state.scores.map((score) => [`${score.assignmentId}:${score.studentId}`, score.value])
  );

  const rows = [];

  const meta = emptyRow();
  meta['记录类型'] = '文件信息';
  meta['格式版本'] = String(CSV_FORMAT_VERSION);
  meta['数据版本'] = String(state.schemaVersion);
  meta['导出时间'] = exportedAt;
  rows.push(meta);

  for (const student of state.students) {
    const seat = seatsByStudentId.get(student.id);
    const { row, col } = seatIndexToRowCol(seat.seatIndex);
    const item = emptyRow();
    item['记录类型'] = '学生';
    item['编号'] = String(student.id);
    item['名称'] = student.name;
    item['首字母'] = student.initial;
    item['座位行'] = String(row);
    item['座位列'] = String(col);
    rows.push(item);
  }

  for (const assignment of state.assignments) {
    const item = emptyRow();
    item['记录类型'] = '作业';
    item['编号'] = String(assignment.id);
    item['名称'] = assignment.name;
    item['当前作业'] = yesNo(assignment.id === state.activeAssignmentId);
    rows.push(item);
  }

  for (const submission of state.submissions) {
    const item = emptyRow();
    const key = `${submission.assignmentId}:${submission.studentId}`;
    const score = scoreByKey.get(key);
    item['记录类型'] = '作业记录';
    item['作业编号'] = String(submission.assignmentId);
    item['作业名称（仅供查看）'] = assignmentsById.get(submission.assignmentId)?.name ?? '';
    item['学生编号'] = String(submission.studentId);
    item['学生姓名（仅供查看）'] = studentsById.get(submission.studentId)?.name ?? '';
    item['已交'] = YES;
    item['作业分数'] = score == null ? '' : String(score);
    rows.push(item);
  }

  for (const role of state.roles) {
    const item = emptyRow();
    item['记录类型'] = '班干';
    item['编号'] = String(role.id);
    item['名称'] = role.title;
    rows.push(item);
    for (const studentId of role.studentIds) {
      const member = emptyRow();
      member['记录类型'] = '班干成员';
      member['班干编号'] = String(role.id);
      member['班干名称（仅供查看）'] = role.title;
      member['学生编号'] = String(studentId);
      member['学生姓名（仅供查看）'] = studentsById.get(studentId)?.name ?? '';
      rows.push(member);
    }
  }

  for (const duty of state.duties) {
    const item = emptyRow();
    item['记录类型'] = '值日';
    item['编号'] = String(duty.id);
    item['名称'] = duty.title;
    item['说明'] = duty.note;
    rows.push(item);
    for (const studentId of duty.studentIds) {
      const member = emptyRow();
      member['记录类型'] = '值日成员';
      member['值日编号'] = String(duty.id);
      member['值日名称（仅供查看）'] = duty.title;
      member['学生编号'] = String(studentId);
      member['学生姓名（仅供查看）'] = studentsById.get(studentId)?.name ?? '';
      rows.push(member);
    }
  }

  for (const period of state.periods) {
    const item = emptyRow();
    item['记录类型'] = '节次';
    item['编号'] = String(period.id);
    item['名称'] = period.title;
    rows.push(item);
  }

  for (const slot of state.scheduleSlots) {
    const item = emptyRow();
    item['记录类型'] = '课表';
    item['星期'] = DAY_LABELS[slot.day] ?? '';
    item['节次编号'] = String(slot.periodId);
    item['节次名称（仅供查看）'] = periodsById.get(slot.periodId)?.title ?? '';
    item['课表科目'] = slot.subject;
    rows.push(item);
  }

  for (const subject of state.subjects) {
    const item = emptyRow();
    item['记录类型'] = '科目';
    item['编号'] = String(subject.id);
    item['名称'] = subject.title;
    rows.push(item);
  }

  for (const exam of state.exams) {
    const item = emptyRow();
    item['记录类型'] = '考试';
    item['编号'] = String(exam.id);
    item['名称'] = exam.title;
    rows.push(item);
  }

  for (const grade of state.courseGrades) {
    const item = emptyRow();
    item['记录类型'] = '课程成绩';
    item['考试编号'] = String(grade.examId);
    item['考试名称（仅供查看）'] = examsById.get(grade.examId)?.title ?? '';
    item['科目编号'] = String(grade.subjectId);
    item['科目名称（仅供查看）'] = subjectsById.get(grade.subjectId)?.title ?? '';
    item['学生编号'] = String(grade.studentId);
    item['学生姓名（仅供查看）'] = studentsById.get(grade.studentId)?.name ?? '';
    item['课程成绩'] = String(grade.value);
    rows.push(item);
  }

  return serializeCsvRows(rows);
}

function parseCsvRecords(text) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
      i += 1;
      if (source[i] === '\n') i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  if (inQuotes) {
    return { ok: false, error: 'CSV 引号未正确闭合' };
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return { ok: true, rows };
}

function isBlankRow(cells) {
  return cells.every((cell) => cell.trim() === '');
}

function rowError(line, message) {
  return { ok: false, error: `第 ${line} 行：${message}` };
}

function parsePositiveInt(raw, label) {
  const text = String(raw ?? '').trim();
  if (!/^[1-9]\d*$/.test(text)) return { ok: false, error: `${label}无效` };
  const value = Number(text);
  if (!Number.isSafeInteger(value)) return { ok: false, error: `${label}无效` };
  return { ok: true, value };
}

function parseYesNo(raw, label) {
  const text = String(raw ?? '').trim();
  if (text === YES) return { ok: true, value: true };
  if (text === NO) return { ok: true, value: false };
  return { ok: false, error: `${label}必须为是或否` };
}

function parseDayLabel(raw) {
  const text = String(raw ?? '').trim();
  const day = DAY_LABELS.indexOf(text);
  if (day < 0) return { ok: false, error: '星期无效' };
  return { ok: true, value: day };
}

function maxId(items) {
  return items.reduce((max, item) => Math.max(max, item.id), 0);
}

/**
 * Parse a roster CSV string into validated business data, or a line-numbered error.
 */
export function parseRosterCsv(text) {
  if (typeof text !== 'string') {
    return { ok: false, error: '无法读取 CSV 文件' };
  }

  const parsed = parseCsvRecords(text);
  if (!parsed.ok) return parsed;

  const rawRows = parsed.rows;
  if (!rawRows.length) {
    return { ok: false, error: 'CSV 缺少表头' };
  }

  const headerCells = rawRows[0].map((cell) => unguardFormula(cell).trim());
  const seen = new Set();
  for (const name of headerCells) {
    if (!name) continue;
    if (seen.has(name)) {
      return { ok: false, error: `列名重复：${name}` };
    }
    seen.add(name);
  }

  for (const required of CSV_COLUMNS) {
    if (!seen.has(required)) {
      return { ok: false, error: `缺少必需列：${required}` };
    }
  }

  const columnIndex = new Map(headerCells.map((name, index) => [name, index]));

  function cellAt(cells, name) {
    const index = columnIndex.get(name);
    if (index == null || index >= cells.length) return '';
    return unguardFormula(cells[index] ?? '');
  }

  const students = [];
  const seats = [];
  const assignments = [];
  const submissions = [];
  const scores = [];
  const roles = [];
  const duties = [];
  const periods = [];
  const scheduleSlots = [];
  const subjects = [];
  const exams = [];
  const courseGrades = [];

  const studentIds = new Set();
  const seatIndexes = new Set();
  const assignmentIds = new Set();
  const roleIds = new Set();
  const dutyIds = new Set();
  const periodIds = new Set();
  const subjectIds = new Set();
  const examIds = new Set();
  const roleMemberKeys = new Set();
  const dutyMemberKeys = new Set();
  const submissionKeys = new Set();
  const scoreKeys = new Set();
  const slotKeys = new Set();
  const gradeKeys = new Set();

  let fileInfoCount = 0;
  let activeAssignmentId = null;

  for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex += 1) {
    const line = rowIndex + 1;
    const cells = rawRows[rowIndex];
    if (isBlankRow(cells)) continue;

    const recordType = cellAt(cells, '记录类型').trim();
    if (!RECORD_TYPES.includes(recordType)) {
      return rowError(line, `未知记录类型「${recordType || '（空）'}」`);
    }

    if (recordType === '文件信息') {
      fileInfoCount += 1;
      if (fileInfoCount > 1) return rowError(line, '文件信息只能有一条');

      const formatParsed = parsePositiveInt(cellAt(cells, '格式版本'), '格式版本');
      if (!formatParsed.ok) return rowError(line, formatParsed.error);
      if (formatParsed.value !== CSV_FORMAT_VERSION) {
        return rowError(line, '暂不支持此 CSV 格式版本');
      }

      const dataParsed = parsePositiveInt(cellAt(cells, '数据版本'), '数据版本');
      if (!dataParsed.ok) return rowError(line, dataParsed.error);
      if (dataParsed.value !== ROSTER_SCHEMA_VERSION) {
        return rowError(line, '暂不支持此数据版本');
      }
      continue;
    }

    if (recordType === '学生') {
      const idParsed = parsePositiveInt(cellAt(cells, '编号'), '编号');
      if (!idParsed.ok) return rowError(line, idParsed.error);
      if (studentIds.has(idParsed.value)) return rowError(line, `学生编号 ${idParsed.value} 重复`);

      const name = cellAt(cells, '名称').trim();
      if (!name) return rowError(line, '名称不能为空');

      const initial = cellAt(cells, '首字母').trim().toUpperCase();
      if (!/^[A-Z#]$/.test(initial)) return rowError(line, '首字母无效');

      const rowParsed = parsePositiveInt(cellAt(cells, '座位行'), '座位行');
      if (!rowParsed.ok) return rowError(line, rowParsed.error);
      if (rowParsed.value < 1 || rowParsed.value > SEAT_ROWS) {
        return rowError(line, '座位行超出范围');
      }

      const colParsed = parsePositiveInt(cellAt(cells, '座位列'), '座位列');
      if (!colParsed.ok) return rowError(line, colParsed.error);
      if (colParsed.value < 1 || colParsed.value > SEAT_COLUMNS) {
        return rowError(line, '座位列超出范围');
      }

      const seatIndex = rowColToSeatIndex(rowParsed.value, colParsed.value);
      if (seatIndex < 0 || seatIndex >= SEAT_COUNT) return rowError(line, '座位无效');
      if (seatIndexes.has(seatIndex)) return rowError(line, '座位重复');

      studentIds.add(idParsed.value);
      seatIndexes.add(seatIndex);
      students.push({ id: idParsed.value, name, initial });
      seats.push({ studentId: idParsed.value, seatIndex });
      continue;
    }

    if (recordType === '作业') {
      const idParsed = parsePositiveInt(cellAt(cells, '编号'), '编号');
      if (!idParsed.ok) return rowError(line, idParsed.error);
      if (assignmentIds.has(idParsed.value)) return rowError(line, `作业编号 ${idParsed.value} 重复`);

      const name = cellAt(cells, '名称').trim();
      if (!name) return rowError(line, '名称不能为空');

      const currentParsed = parseYesNo(cellAt(cells, '当前作业'), '当前作业');
      if (!currentParsed.ok) return rowError(line, currentParsed.error);
      if (currentParsed.value) {
        if (activeAssignmentId != null) {
          return rowError(line, '当前作业只能有一个');
        }
        activeAssignmentId = idParsed.value;
      }

      assignmentIds.add(idParsed.value);
      assignments.push({ id: idParsed.value, name });
      continue;
    }

    if (recordType === '作业记录') {
      const assignmentParsed = parsePositiveInt(cellAt(cells, '作业编号'), '作业编号');
      if (!assignmentParsed.ok) return rowError(line, assignmentParsed.error);
      if (!assignmentIds.has(assignmentParsed.value)) {
        return rowError(line, `作业编号 ${assignmentParsed.value} 不存在`);
      }

      const studentParsed = parsePositiveInt(cellAt(cells, '学生编号'), '学生编号');
      if (!studentParsed.ok) return rowError(line, studentParsed.error);
      if (!studentIds.has(studentParsed.value)) {
        return rowError(line, `学生编号 ${studentParsed.value} 不存在`);
      }

      const submittedParsed = parseYesNo(cellAt(cells, '已交'), '已交');
      if (!submittedParsed.ok) return rowError(line, submittedParsed.error);

      const scoreRaw = cellAt(cells, '作业分数').trim();
      const key = `${assignmentParsed.value}:${studentParsed.value}`;

      if (!submittedParsed.value) {
        if (scoreRaw) return rowError(line, '未交作业不能有分数');
        continue;
      }

      if (submissionKeys.has(key)) return rowError(line, '作业记录重复');
      submissionKeys.add(key);
      submissions.push({
        assignmentId: assignmentParsed.value,
        studentId: studentParsed.value
      });

      if (scoreRaw) {
        const scoreValue = parseScore(scoreRaw);
        if (scoreValue === null || !isScoreValue(scoreValue)) {
          return rowError(line, '作业分数无效');
        }
        if (scoreKeys.has(key)) return rowError(line, '作业分数重复');
        scoreKeys.add(key);
        scores.push({
          assignmentId: assignmentParsed.value,
          studentId: studentParsed.value,
          value: scoreValue
        });
      }
      continue;
    }

    if (recordType === '班干') {
      const idParsed = parsePositiveInt(cellAt(cells, '编号'), '编号');
      if (!idParsed.ok) return rowError(line, idParsed.error);
      if (roleIds.has(idParsed.value)) return rowError(line, `班干编号 ${idParsed.value} 重复`);
      const title = cellAt(cells, '名称').trim();
      if (!title) return rowError(line, '名称不能为空');
      if (title.length > 40) return rowError(line, '名称过长');
      roleIds.add(idParsed.value);
      roles.push({ id: idParsed.value, title, studentIds: [] });
      continue;
    }

    if (recordType === '班干成员') {
      const roleParsed = parsePositiveInt(cellAt(cells, '班干编号'), '班干编号');
      if (!roleParsed.ok) return rowError(line, roleParsed.error);
      const role = roles.find((item) => item.id === roleParsed.value);
      if (!role) return rowError(line, `班干编号 ${roleParsed.value} 不存在`);

      const studentParsed = parsePositiveInt(cellAt(cells, '学生编号'), '学生编号');
      if (!studentParsed.ok) return rowError(line, studentParsed.error);
      if (!studentIds.has(studentParsed.value)) {
        return rowError(line, `学生编号 ${studentParsed.value} 不存在`);
      }

      const key = `${roleParsed.value}:${studentParsed.value}`;
      if (roleMemberKeys.has(key)) return rowError(line, '班干成员重复');
      roleMemberKeys.add(key);
      role.studentIds.push(studentParsed.value);
      continue;
    }

    if (recordType === '值日') {
      const idParsed = parsePositiveInt(cellAt(cells, '编号'), '编号');
      if (!idParsed.ok) return rowError(line, idParsed.error);
      if (dutyIds.has(idParsed.value)) return rowError(line, `值日编号 ${idParsed.value} 重复`);
      const title = cellAt(cells, '名称').trim();
      if (!title) return rowError(line, '名称不能为空');
      if (title.length > 40) return rowError(line, '名称过长');
      const note = cellAt(cells, '说明').trim();
      if (note.length > 40) return rowError(line, '说明过长');
      dutyIds.add(idParsed.value);
      duties.push({ id: idParsed.value, title, note, studentIds: [] });
      continue;
    }

    if (recordType === '值日成员') {
      const dutyParsed = parsePositiveInt(cellAt(cells, '值日编号'), '值日编号');
      if (!dutyParsed.ok) return rowError(line, dutyParsed.error);
      const duty = duties.find((item) => item.id === dutyParsed.value);
      if (!duty) return rowError(line, `值日编号 ${dutyParsed.value} 不存在`);

      const studentParsed = parsePositiveInt(cellAt(cells, '学生编号'), '学生编号');
      if (!studentParsed.ok) return rowError(line, studentParsed.error);
      if (!studentIds.has(studentParsed.value)) {
        return rowError(line, `学生编号 ${studentParsed.value} 不存在`);
      }

      const key = `${dutyParsed.value}:${studentParsed.value}`;
      if (dutyMemberKeys.has(key)) return rowError(line, '值日成员重复');
      dutyMemberKeys.add(key);
      duty.studentIds.push(studentParsed.value);
      continue;
    }

    if (recordType === '节次') {
      const idParsed = parsePositiveInt(cellAt(cells, '编号'), '编号');
      if (!idParsed.ok) return rowError(line, idParsed.error);
      if (periodIds.has(idParsed.value)) return rowError(line, `节次编号 ${idParsed.value} 重复`);
      const title = cellAt(cells, '名称').trim();
      if (!title) return rowError(line, '名称不能为空');
      if (title.length > 40) return rowError(line, '名称过长');
      periodIds.add(idParsed.value);
      periods.push({ id: idParsed.value, title });
      continue;
    }

    if (recordType === '课表') {
      const dayParsed = parseDayLabel(cellAt(cells, '星期'));
      if (!dayParsed.ok) return rowError(line, dayParsed.error);

      const periodParsed = parsePositiveInt(cellAt(cells, '节次编号'), '节次编号');
      if (!periodParsed.ok) return rowError(line, periodParsed.error);
      if (!periodIds.has(periodParsed.value)) {
        return rowError(line, `节次编号 ${periodParsed.value} 不存在`);
      }

      const subject = cellAt(cells, '课表科目').trim();
      if (!subject) return rowError(line, '课表科目不能为空');
      if (subject.length > 40) return rowError(line, '课表科目过长');

      const key = `${dayParsed.value}:${periodParsed.value}`;
      if (slotKeys.has(key)) return rowError(line, '课表格重复');
      slotKeys.add(key);
      scheduleSlots.push({
        day: dayParsed.value,
        periodId: periodParsed.value,
        subject
      });
      continue;
    }

    if (recordType === '科目') {
      const idParsed = parsePositiveInt(cellAt(cells, '编号'), '编号');
      if (!idParsed.ok) return rowError(line, idParsed.error);
      if (subjectIds.has(idParsed.value)) return rowError(line, `科目编号 ${idParsed.value} 重复`);
      const title = cellAt(cells, '名称').trim();
      if (!title) return rowError(line, '名称不能为空');
      if (title.length > 40) return rowError(line, '名称过长');
      subjectIds.add(idParsed.value);
      subjects.push({ id: idParsed.value, title });
      continue;
    }

    if (recordType === '考试') {
      const idParsed = parsePositiveInt(cellAt(cells, '编号'), '编号');
      if (!idParsed.ok) return rowError(line, idParsed.error);
      if (examIds.has(idParsed.value)) return rowError(line, `考试编号 ${idParsed.value} 重复`);
      const title = cellAt(cells, '名称').trim();
      if (!title) return rowError(line, '名称不能为空');
      if (title.length > 40) return rowError(line, '名称过长');
      examIds.add(idParsed.value);
      exams.push({ id: idParsed.value, title });
      continue;
    }

    if (recordType === '课程成绩') {
      const examParsed = parsePositiveInt(cellAt(cells, '考试编号'), '考试编号');
      if (!examParsed.ok) return rowError(line, examParsed.error);
      if (!examIds.has(examParsed.value)) {
        return rowError(line, `考试编号 ${examParsed.value} 不存在`);
      }

      const subjectParsed = parsePositiveInt(cellAt(cells, '科目编号'), '科目编号');
      if (!subjectParsed.ok) return rowError(line, subjectParsed.error);
      if (!subjectIds.has(subjectParsed.value)) {
        return rowError(line, `科目编号 ${subjectParsed.value} 不存在`);
      }

      const studentParsed = parsePositiveInt(cellAt(cells, '学生编号'), '学生编号');
      if (!studentParsed.ok) return rowError(line, studentParsed.error);
      if (!studentIds.has(studentParsed.value)) {
        return rowError(line, `学生编号 ${studentParsed.value} 不存在`);
      }

      const scoreValue = parseScore(cellAt(cells, '课程成绩').trim());
      if (scoreValue === null || !isScoreValue(scoreValue)) {
        return rowError(line, '课程成绩无效');
      }

      const key = `${examParsed.value}:${subjectParsed.value}:${studentParsed.value}`;
      if (gradeKeys.has(key)) return rowError(line, '课程成绩重复');
      gradeKeys.add(key);
      courseGrades.push({
        examId: examParsed.value,
        subjectId: subjectParsed.value,
        studentId: studentParsed.value,
        value: scoreValue
      });
    }
  }

  if (fileInfoCount === 0) {
    return { ok: false, error: '缺少文件信息记录' };
  }
  if (!students.length) return { ok: false, error: '缺少学生记录' };
  if (!assignments.length) return { ok: false, error: '缺少作业记录' };
  if (activeAssignmentId == null) return { ok: false, error: '缺少当前作业' };
  if (!roles.length) return { ok: false, error: '缺少班干记录' };
  if (!duties.length) return { ok: false, error: '缺少值日记录' };
  if (periods.length !== PERIOD_COUNT) {
    return { ok: false, error: `节次必须恰好 ${PERIOD_COUNT} 条` };
  }
  if (!subjects.length) return { ok: false, error: '缺少科目记录' };
  if (!exams.length) return { ok: false, error: '缺少考试记录' };

  const state = {
    schemaVersion: ROSTER_SCHEMA_VERSION,
    students,
    seats,
    assignments,
    activeAssignmentId,
    submissions,
    scores,
    nextAssignmentId: maxId(assignments),
    roles,
    duties,
    nextRoleId: maxId(roles),
    nextDutyId: maxId(duties),
    periods,
    scheduleSlots,
    subjects,
    exams,
    courseGrades,
    nextPeriodId: maxId(periods),
    nextSubjectId: maxId(subjects),
    nextExamId: maxId(exams)
  };

  if (!isValidRosterState(state)) {
    return { ok: false, error: 'CSV 数据格式不正确' };
  }

  return { ok: true, data: cloneRosterState(state) };
}

/**
 * Initialise CSV import/export.
 *
 * @param {object} options
 * @param {import('./roster-store.js').RosterStore} options.store
 * @param {(msg: string) => void} options.showToast
 * @param {(opts: { title: string, message: string, action: () => void }) => void} options.confirm
 * @param {HTMLInputElement} options.fileInput
 * @param {() => void} [options.onAfterImport]
 */
export function initCsvTransfer({ store, showToast, confirm, fileInput, onAfterImport } = {}) {
  let importing = false;
  let exporting = false;

  async function exportCsv() {
    if (exporting) return;
    exporting = true;

    try {
      const snapshot = store.getSnapshot();
      const csv = serializeRosterCsv(snapshot);
      const filename = generateCsvFilename();
      const result = await shareOrDownloadText(csv, filename, {
        mimeType: 'text/csv;charset=utf-8',
        shareTitle: '教师工作台 CSV',
        dialogTitle: '导出 CSV'
      });
      if (result === 'aborted') return;
      if (result === 'downloaded') {
        showToast('CSV 已保存');
      } else {
        showToast('CSV 已导出');
      }
    } catch {
      showToast('导出 CSV 失败');
    } finally {
      exporting = false;
    }
  }

  async function importCsv() {
    if (importing) return;
    importing = true;

    try {
      const result = await openTextFile(fileInput, {
        accept: '.csv,text/csv',
        maxSize: MAX_TEXT_FILE_SIZE,
        tooLargeError: 'CSV 文件过大',
        readError: '无法读取 CSV 文件'
      });

      if (result.aborted) return;

      if (result.error) {
        showToast(result.error);
        return;
      }

      const parsed = parseRosterCsv(result.text);
      if (!parsed.ok) {
        showToast(parsed.error);
        return;
      }

      confirm({
        title: '导入 CSV',
        message: '导入 CSV 后将替换当前所有业务数据，此操作不可撤销。',
        action: () => {
          const replaceResult = store.replaceSnapshot(parsed.data);
          if (replaceResult === 'replaced') {
            showToast('CSV 已导入');
            onAfterImport?.();
          } else if (replaceResult === 'persist-failed') {
            showToast('CSV 导入失败，无法保存');
          } else {
            showToast('CSV 数据格式不正确');
          }
        }
      });
    } finally {
      importing = false;
    }
  }

  return { exportCsv, importCsv };
}
