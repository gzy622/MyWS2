import { elements } from './dom.js';
import { initNavigation, renderNavigation } from './navigation.js';
import { initHorizontalGestures } from './gestures.js';
import { closeDrawer, initDrawer } from './drawer.js';
import { showToast } from './toast.js';
import { initStudentFontSize } from './student-font-size.js';
import { initSeatCanvas } from './seat-canvas.js';
import { createRosterStore } from './roster-store.js';
import { initRosterRenderer } from './roster-renderer.js';
import { initPeopleRenderer } from './people-renderer.js';
import { initPeopleInteractions } from './people-interactions.js';
import { initCoursesRenderer } from './courses-renderer.js';
import { initCoursesInteractions } from './courses-interactions.js';
import { initHighlightSubjects } from './highlight-subjects.js';
import { initStudentInteractions } from './student-interactions.js';
import { initStudentRecord } from './student-record.js';
import { initAssignments } from './assignments.js';
import { initMoreSheet } from './more-sheet.js';
import { loadRosterState, saveRosterState } from './roster-storage.js';
import { initTheme } from './theme.js';
import { initViewport } from './viewport.js';
import { createSystemBackController } from './system-back.js';
import { initSheetDebug } from './sheet-debug.js';
import { initBuildId } from './build-id.js';
import { initLetterIndex } from './letter-index.js';

export const rosterStore = createRosterStore(loadRosterState(), saveRosterState);
const theme = initTheme();
const appViewport = initViewport({ app: elements.app, studentGrid: elements.studentGrid });
initBuildId();
initSheetDebug();

initNavigation({ getActiveAssignmentTitle: () => rosterStore.getCurrentAssignment().name });
const fontSize = initStudentFontSize();
initRosterRenderer(rosterStore);
initLetterIndex(rosterStore);
initPeopleRenderer(rosterStore);
let studentRecord;
let assignments;
let moreSheet;
let people;
let courses;
let highlightSubjects;
function closeOverlays(except) {
  if (except !== 'people-pick') people?.closePick({ restoreFocus: false });
  if (except !== 'people-edit') people?.closeEdit({ restoreFocus: false });
  if (except !== 'course-slot') courses?.closeSlot({ restoreFocus: false });
  if (except !== 'course-period') courses?.closePeriod({ restoreFocus: false });
  if (except !== 'course-subject') courses?.closeSubject({ restoreFocus: false });
  if (except !== 'course-grade') courses?.closeGrade({ restoreFocus: false });
  if (except !== 'course-highlight') highlightSubjects?.close({ restoreFocus: false });
  if (except !== 'student-record') studentRecord?.close();
  if (except !== 'assignments') assignments?.close();
  if (except !== 'more') moreSheet?.close({ restoreFocus: false });
  if (except !== 'confirm') moreSheet?.closeConfirm({ restoreFocus: false });
  if (except !== 'font-size') fontSize.close();
  if (except !== 'drawer') closeDrawer({ restoreFocus: false });
}
highlightSubjects = initHighlightSubjects({
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
});
initCoursesRenderer(rosterStore, highlightSubjects);
studentRecord = initStudentRecord({ store: rosterStore, showToast, viewport: appViewport, closeOthers: closeOverlays });
assignments = initAssignments({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
});
initStudentInteractions({ store: rosterStore, showToast, openStudentRecord: studentRecord.open });
export const seatCanvas = initSeatCanvas({ store: rosterStore, showToast, openStudentRecord: studentRecord.open });
moreSheet = initMoreSheet({
  store: rosterStore,
  showToast,
  seatCanvas,
  fontSize,
  closeOthers: closeOverlays,
  highlightSubjects,
});
people = initPeopleInteractions({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
});
courses = initCoursesInteractions({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
});
initDrawer({ closeOverlays, theme, showToast });
initHorizontalGestures();
createSystemBackController({
  closeConfirm: () => moreSheet.closeConfirm(),
  dismissPeople: () => people.dismissBack(),
  dismissCourses: () => highlightSubjects.dismissBack() || courses.dismissBack(),
  dismissAssignments: () => assignments.dismissBack(),
  closeStudentRecord: () => studentRecord.close(),
  closeMore: () => moreSheet.close(),
  closeFontSize: () => fontSize.close(),
  closeDrawer: () => closeDrawer(),
});
renderNavigation({ animate: false });
