import { elements } from './dom.js';
import { state } from './state.js';
import { OVERLAY_CLOSE_ORDER, OVERLAY_IDS } from './overlay-stack.js';

/**
 * Close the topmost sheet/overlay. Returns true when something was dismissed.
 * Priority is declared in overlay-stack.js and shared with Sheet gestures.
 */
export function createSystemBackController({
  closeConfirm,
  dismissPeople,
  dismissCourses,
  dismissAssignments,
  dismissRosterEditor,
  closeStudentRecord,
  closeMore,
  closeFontSize,
  closeDrawer,
  exitSeatLandscape,
  beforeDismiss,
}) {
  const isPresented = {
    [OVERLAY_IDS.confirm]: () => elements.confirmSheet.classList.contains('show'),
    [OVERLAY_IDS.courseHighlight]: () => document.querySelector('.course-highlight-sheet.show'),
    [OVERLAY_IDS.courseStats]: () => document.querySelector('.course-stats-sheet.show'),
    [OVERLAY_IDS.examName]: () => document.querySelector('.exam-name-sheet.show'),
    [OVERLAY_IDS.exams]: () => document.querySelector('.exam-sheet.show'),
    [OVERLAY_IDS.courseSubject]: () => document.querySelector('.course-subject-sheet.show'),
    [OVERLAY_IDS.coursePeriod]: () => document.querySelector('.course-period-sheet.show'),
    [OVERLAY_IDS.courseSlot]: () => document.querySelector('.course-slot-sheet.show'),
    [OVERLAY_IDS.courseGrade]: () => document.querySelector('.course-grade-sheet.show'),
    [OVERLAY_IDS.peopleEdit]: () => document.querySelector('.people-edit-sheet.show'),
    [OVERLAY_IDS.peoplePick]: () => document.querySelector('.people-pick-sheet.show'),
    [OVERLAY_IDS.assignmentName]: () => document.querySelector('.assignment-name-sheet.show'),
    [OVERLAY_IDS.assignments]: () => document.querySelector('.assignment-sheet.show'),
    [OVERLAY_IDS.rosterStudentName]: () => document.querySelector('.roster-student-name-sheet.show'),
    [OVERLAY_IDS.rosterEditor]: () => state.rosterEditorOpen,
    [OVERLAY_IDS.studentRecord]: () => elements.studentRecordSheet.classList.contains('show'),
    [OVERLAY_IDS.more]: () => elements.moreMenu.classList.contains('show'),
    [OVERLAY_IDS.fontSize]: () => state.fontSizePopoverOpen,
    [OVERLAY_IDS.drawer]: () => elements.app.classList.contains('drawer-open') || state.drawerOpen,
    [OVERLAY_IDS.seatLandscape]: () => state.seatLandscape,
  };

  const dismiss = {
    [OVERLAY_IDS.confirm]: () => closeConfirm?.(),
    [OVERLAY_IDS.courseHighlight]: () => dismissCourses?.(),
    [OVERLAY_IDS.courseStats]: () => dismissCourses?.(),
    [OVERLAY_IDS.examName]: () => dismissCourses?.(),
    [OVERLAY_IDS.exams]: () => dismissCourses?.(),
    [OVERLAY_IDS.courseSubject]: () => dismissCourses?.(),
    [OVERLAY_IDS.coursePeriod]: () => dismissCourses?.(),
    [OVERLAY_IDS.courseSlot]: () => dismissCourses?.(),
    [OVERLAY_IDS.courseGrade]: () => dismissCourses?.(),
    [OVERLAY_IDS.peopleEdit]: () => dismissPeople?.(),
    [OVERLAY_IDS.peoplePick]: () => dismissPeople?.(),
    [OVERLAY_IDS.assignmentName]: () => dismissAssignments?.(),
    [OVERLAY_IDS.assignments]: () => dismissAssignments?.(),
    [OVERLAY_IDS.rosterStudentName]: () => dismissRosterEditor?.(),
    [OVERLAY_IDS.rosterEditor]: () => dismissRosterEditor?.(),
    [OVERLAY_IDS.studentRecord]: () => closeStudentRecord?.(),
    [OVERLAY_IDS.more]: () => closeMore?.(),
    [OVERLAY_IDS.fontSize]: () => closeFontSize?.(),
    [OVERLAY_IDS.drawer]: () => closeDrawer?.(),
    [OVERLAY_IDS.seatLandscape]: () => exitSeatLandscape?.(),
  };

  function dismissTopLayer() {
    // End any in-flight pointer sequence before mutating the overlay stack.
    beforeDismiss?.();
    for (const id of OVERLAY_CLOSE_ORDER) {
      if (!isPresented[id]?.()) continue;
      dismiss[id]?.();
      return true;
    }
    return false;
  }

  function onEscape(event) {
    if (event.key !== 'Escape') return;
    if (!dismissTopLayer()) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onNativeBack() {
    if (dismissTopLayer()) return;
    const App = globalThis.Capacitor?.Plugins?.App;
    App?.exitApp?.();
  }

  document.addEventListener('keydown', onEscape, true);

  const Capacitor = globalThis.Capacitor;
  let backListener;
  if (Capacitor?.isNativePlatform?.()) {
    const App = Capacitor.Plugins?.App;
    if (App?.addListener) {
      Promise.resolve(App.addListener('backButton', onNativeBack))
        .then((handle) => { backListener = handle; })
        .catch(() => {});
    }
  }

  return {
    dismissTopLayer,
    destroy() {
      document.removeEventListener('keydown', onEscape, true);
      backListener?.remove?.();
    },
  };
}
