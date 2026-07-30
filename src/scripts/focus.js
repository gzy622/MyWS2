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
  if (element.closest?.('.topbar, .assignment-sheet, .assignment-name-sheet, .exam-sheet, .exam-name-sheet, .menu-drawer, .more-menu, .student-record-sheet, .people-pick-sheet, .people-edit-sheet, .course-slot-sheet, .course-period-sheet, .course-subject-sheet, .course-grade-sheet, .course-stats-sheet, .course-highlight-sheet, .confirm-sheet, .roster-editor, .roster-student-name-sheet')) {
    element.blur();
  }
}

/**
 * Business overlays that keep the app chrome (topbar / viewport / bottom nav) inert
 * while any one of them is presented — including nested sheets.
 */
const CHROME_LOCK_SELECTORS = [
  '.student-record-sheet.show',
  '.confirm-sheet.show',
  '.assignment-sheet.show',
  '.assignment-name-sheet.show',
  '.exam-sheet.show',
  '.exam-name-sheet.show',
  '.people-pick-sheet.show',
  '.people-edit-sheet.show',
  '.course-slot-sheet.show',
  '.course-period-sheet.show',
  '.course-subject-sheet.show',
  '.course-grade-sheet.show',
  '.course-stats-sheet.show',
  '.course-highlight-sheet.show',
  '.roster-editor.show',
  '.roster-student-name-sheet.show',
  '.more-menu.show',
  '.font-size-popover.show',
];

function isBusinessOverlayOpen(app) {
  const drawer = app.querySelector('#menuDrawer');
  if (app.classList.contains('drawer-open') && !drawer?.classList.contains('is-closing')) {
    return true;
  }
  return CHROME_LOCK_SELECTORS.some((selector) => {
    const overlay = app.querySelector(selector);
    return overlay && !overlay.classList.contains('is-closing');
  });
}

/** Lock or unlock topbar, viewport, and bottom shell based on open overlays. */
export function syncChromeInert() {
  const app = document.getElementById('app');
  if (!app) return;
  const locked = isBusinessOverlayOpen(app);
  for (const node of [
    app.querySelector('.topbar'),
    app.querySelector('#viewport'),
    app.querySelector('.bottom-shell'),
  ]) {
    if (node) node.inert = locked;
  }
}
