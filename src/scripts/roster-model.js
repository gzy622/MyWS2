export const ROSTER_SCHEMA_VERSION = 5;
export const ROSTER_SCHEMA_VERSION_V4 = 4;
export const ROSTER_SCHEMA_VERSION_V3 = 3;
export const ROSTER_SCHEMA_VERSION_V2 = 2;
export const ROSTER_LEGACY_SCHEMA_VERSION = 1;
export const SEAT_COLUMNS = 13;
export const SEAT_ROWS = 8;
export const SEAT_COUNT = SEAT_COLUMNS * SEAT_ROWS;
export const PEOPLE_TEXT_MAX_LENGTH = 40;
export const STUDENT_NAME_MAX_LENGTH = PEOPLE_TEXT_MAX_LENGTH;
export const COURSE_TEXT_MAX_LENGTH = PEOPLE_TEXT_MAX_LENGTH;
export const SCHEDULE_DAY_COUNT = 5;
export const PERIOD_COUNT = 10;

export const SCHEDULE_DAY_LABELS = ['一', '二', '三', '四', '五'];

const DEFAULT_STUDENT_NAMES = [
  '赵予安', '钱书宁', '孙知远', '李念初', '周星禾', '吴乐言', '郑清晏', '王向晚',
  '冯予墨', '陈安然', '褚知行', '卫语桐', '蒋时安', '沈若川', '韩书言', '杨清越',
  '朱明澈', '秦乐知', '尤可心', '许景初', '何星语', '吕安歌', '施雨桐', '张慕白',
  '孔念安', '曹云舒', '严知夏', '华以宁', '金思远', '魏雨泽', '陶书涵', '姜望舒',
  '戚予乐', '谢北辰', '邹清妍', '喻昭然', '柏言蹊', '水知微', '窦安宁', '章乐之',
  '云舒然', '苏清和', '潘星河', '葛知新', '奚望安', '范语晨'
];

const DEFAULT_SEAT_POSITIONS = [
  17, 18, 20, 21, 23, 24,
  27, 28, 30, 31, 33, 34, 36, 37,
  40, 41, 43, 44, 46, 47, 49, 50,
  53, 54, 56, 57, 59, 60, 62, 63,
  66, 67, 69, 70, 72, 73, 75, 76,
  79, 80, 82, 83, 85, 86, 88, 89
];

const DEFAULT_ROLES = [
  { id: 1, title: '班长', studentIds: [] },
  { id: 2, title: '学习委员', studentIds: [] },
  { id: 3, title: '纪律委员', studentIds: [] },
  { id: 4, title: '体育委员', studentIds: [] }
];

const DEFAULT_DUTIES = [
  { id: 1, title: '周一', note: '扫地 · 擦黑板', studentIds: [] },
  { id: 2, title: '周三', note: '扫地 · 倒垃圾', studentIds: [] },
  { id: 3, title: '周五', note: '大扫除', studentIds: [] }
];

const DEFAULT_PERIODS = [
  { id: 1, title: '早' },
  { id: 2, title: '1' },
  { id: 3, title: '2' },
  { id: 4, title: '3' },
  { id: 5, title: '4' },
  { id: 6, title: '午' },
  { id: 7, title: '5' },
  { id: 8, title: '6' },
  { id: 9, title: '7' },
  { id: 10, title: '服' }
];

/** Compact label for the week-matrix period column (keeps full title in store/sheets). */
export function formatPeriodColumnLabel(title) {
  if (typeof title !== 'string') return '';
  const trimmed = title.trim();
  const known = {
    早读: '早',
    早: '早',
    午测: '午',
    午: '午',
    课后服务: '服',
    服: '服'
  };
  if (known[trimmed]) return known[trimmed];
  const lesson = trimmed.match(/^第\s*(\d+)\s*节$/);
  if (lesson) return lesson[1];
  return trimmed;
}

const DEFAULT_SUBJECTS = [
  { id: 1, title: '语文' },
  { id: 2, title: '数学' },
  { id: 3, title: '英语' }
];

const DEFAULT_EXAMS = [
  { id: 1, title: '考试 1' }
];

function hasPositiveId(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function isValidPeopleTitle(title) {
  return typeof title === 'string'
    && title.trim() === title
    && title
    && title.length <= PEOPLE_TEXT_MAX_LENGTH;
}

function isValidPeopleNote(note) {
  return typeof note === 'string'
    && note.trim() === note
    && note.length <= PEOPLE_TEXT_MAX_LENGTH;
}

function isValidCourseSubjectText(subject) {
  return typeof subject === 'string'
    && subject.trim() === subject
    && subject
    && subject.length <= COURSE_TEXT_MAX_LENGTH;
}

function isValidStudentRef(studentId, studentIdSet) {
  return studentId === null || (hasPositiveId(studentId) && studentIdSet.has(studentId));
}

function isValidStudentIds(studentIds, studentIdSet) {
  if (!Array.isArray(studentIds)) return false;
  const unique = new Set(studentIds);
  if (unique.size !== studentIds.length) return false;
  return studentIds.every((id) => hasPositiveId(id) && studentIdSet.has(id));
}

function cloneRole(role) {
  return { id: role.id, title: role.title, studentIds: [...role.studentIds] };
}

function cloneDuty(duty) {
  return { id: duty.id, title: duty.title, note: duty.note, studentIds: [...duty.studentIds] };
}

/** Convert Schema ≤3 role/duty (studentId) into Schema 4 (studentIds). */
export function migratePeopleAssignmentToIds(item, { withNote = false } = {}) {
  let studentIds;
  if (Object.prototype.hasOwnProperty.call(item, 'studentId')) {
    studentIds = item.studentId == null ? [] : [item.studentId];
  } else if (Array.isArray(item.studentIds)) {
    studentIds = [...item.studentIds];
  } else {
    studentIds = [];
  }
  if (withNote) {
    return { id: item.id, title: item.title, note: item.note, studentIds };
  }
  return { id: item.id, title: item.title, studentIds };
}

export function createDefaultRoles() {
  return DEFAULT_ROLES.map((role) => cloneRole(role));
}

export function createDefaultDuties() {
  return DEFAULT_DUTIES.map((duty) => cloneDuty(duty));
}

export function createDefaultPeriods() {
  return DEFAULT_PERIODS.map((period) => ({ ...period }));
}

export function createDefaultSubjects() {
  return DEFAULT_SUBJECTS.map((subject) => ({ ...subject }));
}

export function createDefaultExams() {
  return DEFAULT_EXAMS.map((exam) => ({ ...exam }));
}

export function cloneRosterState(state) {
  return {
    schemaVersion: state.schemaVersion,
    students: state.students.map((student) => ({ ...student })),
    seats: state.seats.map((seat) => ({ ...seat })),
    assignments: state.assignments.map((assignment) => ({ ...assignment })),
    activeAssignmentId: state.activeAssignmentId,
    submissions: state.submissions.map((submission) => ({ ...submission })),
    scores: state.scores.map((score) => ({ ...score })),
    nextAssignmentId: state.nextAssignmentId,
    roles: state.roles.map((role) => cloneRole(role)),
    duties: state.duties.map((duty) => cloneDuty(duty)),
    nextRoleId: state.nextRoleId,
    nextDutyId: state.nextDutyId,
    periods: state.periods.map((period) => ({ ...period })),
    scheduleSlots: state.scheduleSlots.map((slot) => ({ ...slot })),
    subjects: state.subjects.map((subject) => ({ ...subject })),
    exams: state.exams.map((exam) => ({ ...exam })),
    courseGrades: state.courseGrades.map((grade) => ({ ...grade })),
    nextPeriodId: state.nextPeriodId,
    nextSubjectId: state.nextSubjectId,
    nextExamId: state.nextExamId
  };
}

export function createDefaultRosterState() {
  const students = DEFAULT_STUDENT_NAMES.map((name, index) => ({ id: index + 1, name }));
  return {
    schemaVersion: ROSTER_SCHEMA_VERSION,
    students,
    seats: students.map((student, index) => ({
      studentId: student.id,
      seatIndex: DEFAULT_SEAT_POSITIONS[index]
    })),
    assignments: [{ id: 1, name: '作业 1' }],
    activeAssignmentId: 1,
    submissions: [],
    scores: [],
    nextAssignmentId: 1,
    roles: createDefaultRoles(),
    duties: createDefaultDuties(),
    nextRoleId: 4,
    nextDutyId: 3,
    periods: createDefaultPeriods(),
    scheduleSlots: [],
    subjects: createDefaultSubjects(),
    exams: createDefaultExams(),
    courseGrades: [],
    nextPeriodId: 10,
    nextSubjectId: 3,
    nextExamId: 1
  };
}

export function isScoreValue(value) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 100
    && Math.round(value * 10) === value * 10;
}

export function parseScore(value) {
  if (typeof value === 'number') return isScoreValue(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^\d{1,3}(?:\.\d)?$/.test(normalized)) return null;
  const numericValue = Number(normalized);
  return isScoreValue(numericValue) ? numericValue : null;
}

function isValidCoreRosterFields(value) {
  const {
    students, seats, assignments, activeAssignmentId,
    submissions, scores, nextAssignmentId
  } = value;
  if (
    !Array.isArray(students) || !students.length
    || !Array.isArray(seats) || seats.length !== students.length
    || !Array.isArray(assignments) || !assignments.length
    || !Array.isArray(submissions) || !Array.isArray(scores)
    || !Number.isSafeInteger(activeAssignmentId) || !Number.isSafeInteger(nextAssignmentId)
  ) return false;

  if (!students.every((student) => student && hasPositiveId(student.id) && typeof student.name === 'string' && student.name.trim() === student.name && student.name)) return false;
  if (!assignments.every((assignment) => assignment && hasPositiveId(assignment.id) && typeof assignment.name === 'string' && assignment.name.trim() === assignment.name && assignment.name)) return false;
  if (!seats.every((seat) => seat && hasPositiveId(seat.studentId) && Number.isInteger(seat.seatIndex) && seat.seatIndex >= 0 && seat.seatIndex < SEAT_COUNT)) return false;

  const studentIds = students.map(({ id }) => id);
  const assignmentIds = assignments.map(({ id }) => id);
  const key = ({ assignmentId, studentId }) => `${assignmentId}:${studentId}`;
  const submissionKeys = submissions.map(key);
  const scoreKeys = scores.map(key);
  const unique = (items) => new Set(items).size === items.length;
  const studentIdSet = new Set(studentIds);
  const assignmentIdSet = new Set(assignmentIds);
  const submissionKeySet = new Set(submissionKeys);

  return unique(studentIds)
    && unique(assignmentIds)
    && unique(seats.map(({ studentId }) => studentId))
    && unique(seats.map(({ seatIndex }) => seatIndex))
    && unique(submissionKeys)
    && unique(scoreKeys)
    && assignmentIdSet.has(activeAssignmentId)
    && nextAssignmentId >= Math.max(...assignmentIds)
    && seats.every(({ studentId }) => studentIdSet.has(studentId))
    && submissions.every(({ assignmentId, studentId }) => assignmentIdSet.has(assignmentId) && studentIdSet.has(studentId))
    && scores.every((score) => assignmentIdSet.has(score.assignmentId) && studentIdSet.has(score.studentId) && isScoreValue(score.value) && submissionKeySet.has(key(score)));
}

function isValidPeopleFieldsLegacy(value) {
  const { roles, duties, nextRoleId, nextDutyId, students } = value;
  if (
    !Array.isArray(roles) || !roles.length
    || !Array.isArray(duties) || !duties.length
    || !Number.isSafeInteger(nextRoleId) || !Number.isSafeInteger(nextDutyId)
  ) return false;

  const studentIdSet = new Set(students.map(({ id }) => id));
  if (!roles.every((role) => (
    role
    && hasPositiveId(role.id)
    && isValidPeopleTitle(role.title)
    && isValidStudentRef(role.studentId, studentIdSet)
  ))) return false;
  if (!duties.every((duty) => (
    duty
    && hasPositiveId(duty.id)
    && isValidPeopleTitle(duty.title)
    && isValidPeopleNote(duty.note)
    && isValidStudentRef(duty.studentId, studentIdSet)
  ))) return false;

  const roleIds = roles.map(({ id }) => id);
  const dutyIds = duties.map(({ id }) => id);
  const unique = (items) => new Set(items).size === items.length;
  return unique(roleIds)
    && unique(dutyIds)
    && nextRoleId >= Math.max(...roleIds)
    && nextDutyId >= Math.max(...dutyIds);
}

function isValidPeopleFields(value) {
  const { roles, duties, nextRoleId, nextDutyId, students } = value;
  if (
    !Array.isArray(roles) || !roles.length
    || !Array.isArray(duties) || !duties.length
    || !Number.isSafeInteger(nextRoleId) || !Number.isSafeInteger(nextDutyId)
  ) return false;

  const studentIdSet = new Set(students.map(({ id }) => id));
  if (!roles.every((role) => (
    role
    && hasPositiveId(role.id)
    && isValidPeopleTitle(role.title)
    && isValidStudentIds(role.studentIds, studentIdSet)
  ))) return false;
  if (!duties.every((duty) => (
    duty
    && hasPositiveId(duty.id)
    && isValidPeopleTitle(duty.title)
    && isValidPeopleNote(duty.note)
    && isValidStudentIds(duty.studentIds, studentIdSet)
  ))) return false;

  const roleIds = roles.map(({ id }) => id);
  const dutyIds = duties.map(({ id }) => id);
  const unique = (items) => new Set(items).size === items.length;
  return unique(roleIds)
    && unique(dutyIds)
    && nextRoleId >= Math.max(...roleIds)
    && nextDutyId >= Math.max(...dutyIds);
}

function isValidCoursesFieldsLegacy(value) {
  const {
    periods, scheduleSlots, subjects, courseGrades,
    nextPeriodId, nextSubjectId, students
  } = value;
  if (
    !Array.isArray(periods) || periods.length !== PERIOD_COUNT
    || !Array.isArray(scheduleSlots)
    || !Array.isArray(subjects) || !subjects.length
    || !Array.isArray(courseGrades)
    || !Number.isSafeInteger(nextPeriodId) || !Number.isSafeInteger(nextSubjectId)
  ) return false;

  if (!periods.every((period) => (
    period
    && hasPositiveId(period.id)
    && isValidPeopleTitle(period.title)
  ))) return false;

  if (!subjects.every((subject) => (
    subject
    && hasPositiveId(subject.id)
    && isValidPeopleTitle(subject.title)
  ))) return false;

  const periodIds = periods.map(({ id }) => id);
  const subjectIds = subjects.map(({ id }) => id);
  const unique = (items) => new Set(items).size === items.length;
  if (!unique(periodIds) || !unique(subjectIds)) return false;
  if (nextPeriodId < Math.max(...periodIds) || nextSubjectId < Math.max(...subjectIds)) return false;

  const periodIdSet = new Set(periodIds);
  const subjectIdSet = new Set(subjectIds);
  const studentIdSet = new Set(students.map(({ id }) => id));
  const slotKeys = scheduleSlots.map((slot) => `${slot.day}:${slot.periodId}`);
  const gradeKeys = courseGrades.map((grade) => `${grade.subjectId}:${grade.studentId}`);

  if (!unique(slotKeys) || !unique(gradeKeys)) return false;

  if (!scheduleSlots.every((slot) => (
    slot
    && Number.isInteger(slot.day)
    && slot.day >= 0
    && slot.day < SCHEDULE_DAY_COUNT
    && hasPositiveId(slot.periodId)
    && periodIdSet.has(slot.periodId)
    && isValidCourseSubjectText(slot.subject)
  ))) return false;

  return courseGrades.every((grade) => (
    grade
    && hasPositiveId(grade.subjectId)
    && subjectIdSet.has(grade.subjectId)
    && hasPositiveId(grade.studentId)
    && studentIdSet.has(grade.studentId)
    && isScoreValue(grade.value)
  ));
}

function isValidCoursesFields(value) {
  const {
    periods, scheduleSlots, subjects, exams, courseGrades,
    nextPeriodId, nextSubjectId, nextExamId, students
  } = value;
  if (
    !Array.isArray(periods) || periods.length !== PERIOD_COUNT
    || !Array.isArray(scheduleSlots)
    || !Array.isArray(subjects) || !subjects.length
    || !Array.isArray(exams) || !exams.length
    || !Array.isArray(courseGrades)
    || !Number.isSafeInteger(nextPeriodId)
    || !Number.isSafeInteger(nextSubjectId)
    || !Number.isSafeInteger(nextExamId)
  ) return false;

  if (!periods.every((period) => (
    period
    && hasPositiveId(period.id)
    && isValidPeopleTitle(period.title)
  ))) return false;

  if (!subjects.every((subject) => (
    subject
    && hasPositiveId(subject.id)
    && isValidPeopleTitle(subject.title)
  ))) return false;

  if (!exams.every((exam) => (
    exam
    && hasPositiveId(exam.id)
    && isValidPeopleTitle(exam.title)
  ))) return false;

  const periodIds = periods.map(({ id }) => id);
  const subjectIds = subjects.map(({ id }) => id);
  const examIds = exams.map(({ id }) => id);
  const unique = (items) => new Set(items).size === items.length;
  if (!unique(periodIds) || !unique(subjectIds) || !unique(examIds)) return false;
  if (
    nextPeriodId < Math.max(...periodIds)
    || nextSubjectId < Math.max(...subjectIds)
    || nextExamId < Math.max(...examIds)
  ) return false;

  const periodIdSet = new Set(periodIds);
  const subjectIdSet = new Set(subjectIds);
  const examIdSet = new Set(examIds);
  const studentIdSet = new Set(students.map(({ id }) => id));
  const slotKeys = scheduleSlots.map((slot) => `${slot.day}:${slot.periodId}`);
  const gradeKeys = courseGrades.map((grade) => (
    `${grade.examId}:${grade.subjectId}:${grade.studentId}`
  ));

  if (!unique(slotKeys) || !unique(gradeKeys)) return false;

  if (!scheduleSlots.every((slot) => (
    slot
    && Number.isInteger(slot.day)
    && slot.day >= 0
    && slot.day < SCHEDULE_DAY_COUNT
    && hasPositiveId(slot.periodId)
    && periodIdSet.has(slot.periodId)
    && isValidCourseSubjectText(slot.subject)
  ))) return false;

  return courseGrades.every((grade) => (
    grade
    && hasPositiveId(grade.examId)
    && examIdSet.has(grade.examId)
    && hasPositiveId(grade.subjectId)
    && subjectIdSet.has(grade.subjectId)
    && hasPositiveId(grade.studentId)
    && studentIdSet.has(grade.studentId)
    && isScoreValue(grade.value)
  ));
}

export function isValidLegacyRosterStateV1(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion !== ROSTER_LEGACY_SCHEMA_VERSION) return false;
  return isValidCoreRosterFields(value);
}

export function isValidRosterStateV2(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion !== ROSTER_SCHEMA_VERSION_V2) return false;
  return isValidCoreRosterFields(value) && isValidPeopleFieldsLegacy(value);
}

export function isValidRosterStateV3(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion !== ROSTER_SCHEMA_VERSION_V3) return false;
  return isValidCoreRosterFields(value)
    && isValidPeopleFieldsLegacy(value)
    && isValidCoursesFieldsLegacy(value);
}

export function isValidRosterStateV4(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion !== ROSTER_SCHEMA_VERSION_V4) return false;
  return isValidCoreRosterFields(value)
    && isValidPeopleFields(value)
    && isValidCoursesFieldsLegacy(value);
}

export function isValidRosterState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion !== ROSTER_SCHEMA_VERSION) return false;
  return isValidCoreRosterFields(value)
    && isValidPeopleFields(value)
    && isValidCoursesFields(value);
}

function withCourseDefaults(base) {
  const defaults = createDefaultRosterState();
  return {
    ...base,
    schemaVersion: ROSTER_SCHEMA_VERSION,
    periods: defaults.periods.map((period) => ({ ...period })),
    scheduleSlots: [],
    subjects: defaults.subjects.map((subject) => ({ ...subject })),
    exams: defaults.exams.map((exam) => ({ ...exam })),
    courseGrades: [],
    nextPeriodId: defaults.nextPeriodId,
    nextSubjectId: defaults.nextSubjectId,
    nextExamId: defaults.nextExamId
  };
}

function withPeopleIds(base) {
  return {
    ...base,
    roles: base.roles.map((role) => migratePeopleAssignmentToIds(role)),
    duties: base.duties.map((duty) => migratePeopleAssignmentToIds(duty, { withNote: true }))
  };
}

function withExams(base) {
  const defaults = createDefaultRosterState();
  return {
    ...base,
    schemaVersion: ROSTER_SCHEMA_VERSION,
    exams: defaults.exams.map((exam) => ({ ...exam })),
    courseGrades: (base.courseGrades || []).map((grade) => ({
      examId: 1,
      subjectId: grade.subjectId,
      studentId: grade.studentId,
      value: grade.value
    })),
    nextExamId: defaults.nextExamId
  };
}

export function migrateRosterStateToCurrent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  if (value.schemaVersion === ROSTER_SCHEMA_VERSION) {
    return isValidRosterState(value) ? cloneRosterState(value) : null;
  }

  if (value.schemaVersion === ROSTER_SCHEMA_VERSION_V4) {
    if (!isValidRosterStateV4(value)) return null;
    const migrated = withExams({
      students: value.students.map((student) => ({ ...student })),
      seats: value.seats.map((seat) => ({ ...seat })),
      assignments: value.assignments.map((assignment) => ({ ...assignment })),
      activeAssignmentId: value.activeAssignmentId,
      submissions: value.submissions.map((submission) => ({ ...submission })),
      scores: value.scores.map((score) => ({ ...score })),
      nextAssignmentId: value.nextAssignmentId,
      roles: value.roles.map((role) => cloneRole(role)),
      duties: value.duties.map((duty) => cloneDuty(duty)),
      nextRoleId: value.nextRoleId,
      nextDutyId: value.nextDutyId,
      periods: value.periods.map((period) => ({ ...period })),
      scheduleSlots: value.scheduleSlots.map((slot) => ({ ...slot })),
      subjects: value.subjects.map((subject) => ({ ...subject })),
      courseGrades: value.courseGrades,
      nextPeriodId: value.nextPeriodId,
      nextSubjectId: value.nextSubjectId
    });
    return isValidRosterState(migrated) ? migrated : null;
  }

  if (value.schemaVersion === ROSTER_SCHEMA_VERSION_V3) {
    if (!isValidRosterStateV3(value)) return null;
    const migrated = withExams(withPeopleIds({
      students: value.students.map((student) => ({ ...student })),
      seats: value.seats.map((seat) => ({ ...seat })),
      assignments: value.assignments.map((assignment) => ({ ...assignment })),
      activeAssignmentId: value.activeAssignmentId,
      submissions: value.submissions.map((submission) => ({ ...submission })),
      scores: value.scores.map((score) => ({ ...score })),
      nextAssignmentId: value.nextAssignmentId,
      roles: value.roles,
      duties: value.duties,
      nextRoleId: value.nextRoleId,
      nextDutyId: value.nextDutyId,
      periods: value.periods.map((period) => ({ ...period })),
      scheduleSlots: value.scheduleSlots.map((slot) => ({ ...slot })),
      subjects: value.subjects.map((subject) => ({ ...subject })),
      courseGrades: value.courseGrades,
      nextPeriodId: value.nextPeriodId,
      nextSubjectId: value.nextSubjectId
    }));
    return isValidRosterState(migrated) ? migrated : null;
  }

  if (value.schemaVersion === ROSTER_SCHEMA_VERSION_V2) {
    if (!isValidRosterStateV2(value)) return null;
    const migrated = withPeopleIds(withCourseDefaults({
      students: value.students.map((student) => ({ ...student })),
      seats: value.seats.map((seat) => ({ ...seat })),
      assignments: value.assignments.map((assignment) => ({ ...assignment })),
      activeAssignmentId: value.activeAssignmentId,
      submissions: value.submissions.map((submission) => ({ ...submission })),
      scores: value.scores.map((score) => ({ ...score })),
      nextAssignmentId: value.nextAssignmentId,
      roles: value.roles,
      duties: value.duties,
      nextRoleId: value.nextRoleId,
      nextDutyId: value.nextDutyId
    }));
    return isValidRosterState(migrated) ? migrated : null;
  }

  if (!isValidLegacyRosterStateV1(value)) return null;
  const defaults = createDefaultRosterState();
  const migrated = withCourseDefaults({
    students: value.students.map((student) => ({ ...student })),
    seats: value.seats.map((seat) => ({ ...seat })),
    assignments: value.assignments.map((assignment) => ({ ...assignment })),
    activeAssignmentId: value.activeAssignmentId,
    submissions: value.submissions.map((submission) => ({ ...submission })),
    scores: value.scores.map((score) => ({ ...score })),
    nextAssignmentId: value.nextAssignmentId,
    roles: defaults.roles.map((role) => cloneRole(role)),
    duties: defaults.duties.map((duty) => cloneDuty(duty)),
    nextRoleId: defaults.nextRoleId,
    nextDutyId: defaults.nextDutyId
  });
  return isValidRosterState(migrated) ? migrated : null;
}
