export const PAGE_COUNT = 3;
import { isOverlayId } from './overlay-stack.js';
export const STUDENT_FONT_SIZE_MIN = 14;
export const STUDENT_FONT_SIZE_MAX = 18;
export const STUDENT_FONT_SIZE_DEFAULT = 16;

export const state = {
  currentPage: 1,
  subviews: [0, 0, 0],
  drawerOpen: false,
  studentFontSize: STUDENT_FONT_SIZE_DEFAULT,
  fontSizePopoverOpen: false,
  seatEditing: false,
  /** Session-only; swipe/back does not clear. Active gestures require !seatEditing. */
  quickScoreMode: false,
  /** Session-only; shared by register and course grade score sheets. */
  tensScoreMode: false,
  seatLandscape: false,
  rosterEditorOpen: false,
  /** @type {null | 'assignments' | 'exams' | 'student-record' | 'people-pick' | 'people-edit' | 'course-slot' | 'course-period' | 'course-subject' | 'course-grade' | 'course-stats' | 'course-highlight' | 'more' | 'confirm' | 'roster-editor'} */
  activeOverlay: null,
  /** @type {number | null} null resolves to the first exam at render time */
  gradeExamId: null,
  /** @type {{ subjectId: number, direction: 'asc' | 'desc' } | null} */
  gradeSort: null
};

export function clampPage(index) {
  return Math.max(0, Math.min(PAGE_COUNT - 1, index));
}

export function setCurrentPage(index) {
  state.currentPage = clampPage(index);
}

export function setSubview(pageIndex, subIndex) {
  if (pageIndex < 0 || pageIndex >= PAGE_COUNT) return;
  state.subviews[pageIndex] = subIndex;
}

export function toggleSubview(pageIndex) {
  setSubview(pageIndex, 1 - state.subviews[pageIndex]);
}

export function setDrawerOpen(value) {
  state.drawerOpen = value;
}

export function setStudentFontSize(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;
  state.studentFontSize = Math.max(STUDENT_FONT_SIZE_MIN, Math.min(STUDENT_FONT_SIZE_MAX, numericValue));
}

export function setFontSizePopoverOpen(value) {
  state.fontSizePopoverOpen = Boolean(value);
}

export function setSeatEditing(value) {
  state.seatEditing = Boolean(value);
}

export function setQuickScoreMode(value) {
  state.quickScoreMode = Boolean(value);
}

export function setTensScoreMode(value) {
  state.tensScoreMode = Boolean(value);
}

/** True when card gestures should use quick-score semantics (tap opens sheet). */
export function isQuickScoreActive() {
  return state.quickScoreMode && !state.seatEditing;
}

export function setSeatLandscape(value) {
  state.seatLandscape = Boolean(value);
}

export function setRosterEditorOpen(value) {
  state.rosterEditorOpen = Boolean(value);
}

export function setActiveOverlay(value) {
  state.activeOverlay = value === null || isOverlayId(value) ? value : null;
}

export function setGradeExamId(value) {
  if (value === null) {
    state.gradeExamId = null;
    return;
  }
  if (!Number.isSafeInteger(value) || value <= 0) return;
  state.gradeExamId = value;
}

export function setGradeSort(value) {
  if (value === null) {
    state.gradeSort = null;
    return;
  }
  if (
    !value
    || !Number.isSafeInteger(value.subjectId)
    || value.subjectId <= 0
    || (value.direction !== 'asc' && value.direction !== 'desc')
  ) return;
  state.gradeSort = { subjectId: value.subjectId, direction: value.direction };
}
