/**
 * Programmatic focus without showing the :focus-visible ring (pointer/gesture paths).
 * Keyboard users still get rings when they tab to controls themselves.
 */
export function focusSilently(element) {
  if (!(element instanceof HTMLElement)) return;
  try {
    element.focus({ preventScroll: true, focusVisible: false });
  } catch {
    element.focus({ preventScroll: true });
  }
}

/** Drop focus from chrome that should not keep a ring after a sheet gesture. */
export function blurIfSheetChrome(element = document.activeElement) {
  if (!(element instanceof HTMLElement)) return;
  if (element.closest?.('.topbar, .assignment-sheet, .assignment-name-sheet, .menu-drawer, .student-record-sheet, .people-pick-sheet, .people-edit-sheet, .course-slot-sheet, .course-period-sheet, .course-subject-sheet, .course-grade-sheet, .course-highlight-sheet, .confirm-sheet')) {
    element.blur();
  }
}
