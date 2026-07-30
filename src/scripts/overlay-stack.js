/**
 * Authoritative overlay vocabulary, close priority and visual layer metadata.
 * UI modules own opening and closing behaviour; this module only defines the
 * shared ordering contract so gesture, back and mutual-exclusion paths cannot
 * silently diverge.
 */
export const OVERLAY_IDS = Object.freeze({
  confirm: 'confirm',
  courseHighlight: 'course-highlight',
  courseStats: 'course-stats',
  examName: 'exam-name',
  exams: 'exams',
  courseSubject: 'course-subject',
  coursePeriod: 'course-period',
  courseSlot: 'course-slot',
  courseGrade: 'course-grade',
  peopleEdit: 'people-edit',
  peoplePick: 'people-pick',
  assignmentName: 'assignment-name',
  assignments: 'assignments',
  rosterStudentName: 'roster-student-name',
  rosterEditor: 'roster-editor',
  studentRecord: 'student-record',
  more: 'more',
  fontSize: 'font-size',
  drawer: 'drawer',
  seatLandscape: 'seat-landscape'
});

const definitions = [
  [OVERLAY_IDS.confirm, 'sheet', 'nested'],
  [OVERLAY_IDS.courseHighlight, 'sheet', 'nested'],
  [OVERLAY_IDS.courseStats, 'sheet', 'nested'],
  [OVERLAY_IDS.examName, 'sheet', 'nested'],
  [OVERLAY_IDS.exams, 'sheet', 'modal'],
  [OVERLAY_IDS.courseSubject, 'sheet', 'nested'],
  [OVERLAY_IDS.coursePeriod, 'sheet', 'nested'],
  [OVERLAY_IDS.courseSlot, 'sheet', 'modal'],
  [OVERLAY_IDS.courseGrade, 'sheet', 'nested'],
  [OVERLAY_IDS.peopleEdit, 'sheet', 'nested'],
  [OVERLAY_IDS.peoplePick, 'sheet', 'modal'],
  [OVERLAY_IDS.assignmentName, 'sheet', 'nested'],
  [OVERLAY_IDS.assignments, 'sheet', 'modal'],
  [OVERLAY_IDS.rosterStudentName, 'sheet', 'nested'],
  [OVERLAY_IDS.rosterEditor, 'fullscreen', 'modal'],
  [OVERLAY_IDS.studentRecord, 'sheet', 'modal'],
  [OVERLAY_IDS.more, 'sheet', 'modal'],
  [OVERLAY_IDS.fontSize, 'popover', 'popover'],
  [OVERLAY_IDS.drawer, 'sheet', 'modal'],
  [OVERLAY_IDS.seatLandscape, 'mode', 'chrome']
].map(([id, type, layer], closePriority) => Object.freeze({ id, type, layer, closePriority }));

export const OVERLAY_STACK = Object.freeze(definitions);
export const OVERLAY_CLOSE_ORDER = Object.freeze(definitions.map(({ id }) => id));
export const SHEET_STACK_ORDER = Object.freeze(definitions
  .filter(({ type }) => type === 'sheet')
  .map(({ id }) => id));

export function getOverlayMeta(id) {
  return OVERLAY_STACK.find((overlay) => overlay.id === id) ?? null;
}

export function isOverlayId(id) {
  return typeof id === 'string' && getOverlayMeta(id) !== null;
}
