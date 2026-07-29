export const PAGE_COUNT = 3;
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
  seatLandscape: false,
  activeOverlay: null
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

export function setSeatLandscape(value) {
  state.seatLandscape = Boolean(value);
}

export function setActiveOverlay(value) {
  state.activeOverlay = value;
}
