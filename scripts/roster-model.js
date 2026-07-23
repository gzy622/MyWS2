export const ROSTER_SCHEMA_VERSION = 1;
export const SEAT_COLUMNS = 13;
export const SEAT_ROWS = 8;
export const SEAT_COUNT = SEAT_COLUMNS * SEAT_ROWS;

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

export function cloneRosterState(state) {
  return {
    schemaVersion: state.schemaVersion,
    students: state.students.map((student) => ({ ...student })),
    seats: state.seats.map((seat) => ({ ...seat })),
    assignments: state.assignments.map((assignment) => ({ ...assignment })),
    activeAssignmentId: state.activeAssignmentId,
    submissions: state.submissions.map((submission) => ({ ...submission })),
    scores: state.scores.map((score) => ({ ...score })),
    nextAssignmentId: state.nextAssignmentId
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
    nextAssignmentId: 1
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

export function isValidRosterState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const {
    schemaVersion, students, seats, assignments, activeAssignmentId,
    submissions, scores, nextAssignmentId
  } = value;
  if (
    schemaVersion !== ROSTER_SCHEMA_VERSION
    || !Array.isArray(students) || !students.length
    || !Array.isArray(seats) || seats.length !== students.length
    || !Array.isArray(assignments) || !assignments.length
    || !Array.isArray(submissions) || !Array.isArray(scores)
    || !Number.isSafeInteger(activeAssignmentId) || !Number.isSafeInteger(nextAssignmentId)
  ) return false;

  const hasPositiveId = (id) => Number.isSafeInteger(id) && id > 0;
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
