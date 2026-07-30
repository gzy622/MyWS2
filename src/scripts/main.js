import { elements } from './dom.js';
import { initNavigation, renderNavigation } from './navigation.js';
import { initHorizontalGestures, cancelActivePointerGesture } from './gestures.js';
import { closeDrawer, initDrawer } from './drawer.js';
import { showToast } from './toast.js';
import { initStudentFontSize } from './student-font-size.js';
import { initSeatCanvas } from './seat-canvas.js';
import { initSeatLandscape } from './seat-landscape.js';
import { createRosterStore } from './roster-store.js';
import { initRosterRenderer } from './roster-renderer.js';
import { initPeopleRenderer } from './people-renderer.js';
import { initPeopleInteractions } from './people-interactions.js';
import { initCoursesRenderer, resolveGradeExamId } from './courses-renderer.js';
import { initCoursesInteractions } from './courses-interactions.js';
import { initExams } from './exams.js';
import { initHighlightSubjects } from './highlight-subjects.js';
import { initStudentInteractions } from './student-interactions.js';
import { initStudentRecord } from './student-record.js';
import { initAssignments } from './assignments.js';
import { initRosterEditor } from './roster-editor.js';
import { initMoreSheet } from './more-sheet.js';
import { initBackup } from './backup.js';
import { loadRosterState, saveRosterState } from './roster-storage.js';
import { initTheme } from './theme.js';
import { initViewport } from './viewport.js';
import { createSystemBackController } from './system-back.js';
import { initSheetDebug } from './sheet-debug.js';
import { initBuildId } from './build-id.js';
import { initLetterIndex } from './letter-index.js';
import { initScrollThinChrome } from './scroll-thin.js';
import { isOverlayId } from './overlay-stack.js';

export const rosterStore = createRosterStore(loadRosterState(), saveRosterState);
const theme = initTheme();
const appViewport = initViewport({ app: elements.app, studentGrid: elements.studentGrid });
initBuildId();
initSheetDebug();

initNavigation({
  getActiveAssignmentTitle: () => rosterStore.getCurrentAssignment().name,
  getActiveExamTitle: () => {
    const snapshot = rosterStore.getSnapshot();
    const examId = resolveGradeExamId(snapshot);
    return snapshot.exams.find((exam) => exam.id === examId)?.title ?? '课程';
  },
});
const fontSize = initStudentFontSize();
initRosterRenderer(rosterStore);
initLetterIndex(rosterStore);
initPeopleRenderer(rosterStore);
let studentRecord;
let assignments;
let rosterEditor;
let exams;
let moreSheet;
let people;
let courses;
let highlightSubjects;
function closeOverlays(except) {
  const keep = isOverlayId(except) ? except : null;
  if (keep !== 'people-pick') people?.closePick({ restoreFocus: false });
  if (keep !== 'people-edit') people?.closeEdit({ restoreFocus: false });
  if (keep !== 'course-slot') courses?.closeSlot({ restoreFocus: false });
  if (keep !== 'course-period') courses?.closePeriod({ restoreFocus: false });
  if (keep !== 'course-subject') courses?.closeSubject({ restoreFocus: false });
  if (keep !== 'course-grade') courses?.closeGrade({ restoreFocus: false });
  if (keep !== 'course-stats') courses?.closeStats({ restoreFocus: false });
  if (keep !== 'course-highlight') highlightSubjects?.close({ restoreFocus: false });
  if (keep !== 'student-record') studentRecord?.close();
  if (keep !== 'assignments') assignments?.close();
  if (keep !== 'roster-editor' && keep !== 'confirm') rosterEditor?.close();
  if (keep !== 'exams') exams?.close();
  if (keep !== 'more') moreSheet?.close({ restoreFocus: false });
  if (keep !== 'confirm') moreSheet?.closeConfirm({ restoreFocus: false });
  if (keep !== 'font-size') fontSize.close();
  if (keep !== 'drawer') closeDrawer({ restoreFocus: false });
}
highlightSubjects = initHighlightSubjects({
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
});
const coursesRenderer = initCoursesRenderer(rosterStore, highlightSubjects);
studentRecord = initStudentRecord({ store: rosterStore, showToast, viewport: appViewport, closeOthers: closeOverlays });
assignments = initAssignments({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
});
rosterEditor = initRosterEditor({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
});
exams = initExams({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
  onGradesUiChange: () => coursesRenderer.render(),
});
initStudentInteractions({ store: rosterStore, showToast, openStudentRecord: studentRecord.open });
export const seatCanvas = initSeatCanvas({ store: rosterStore, showToast, openStudentRecord: studentRecord.open });
const seatLandscape = initSeatLandscape({ seatCanvas, showToast });
const backup = initBackup({
  store: rosterStore,
  showToast,
  confirm: (...args) => moreSheet.confirm(...args),
  fileInput: document.getElementById('backupFileInput'),
  onAfterImport: () => {
    seatCanvas?.reset();
  }
});

moreSheet = initMoreSheet({
  store: rosterStore,
  showToast,
  seatCanvas,
  fontSize,
  closeOthers: closeOverlays,
  highlightSubjects,
  openCreateAssignment: (options) => assignments.openCreate(options),
  openCreateExam: (options) => exams.openCreate(options),
  openGradeStats: (...args) => courses?.openStats(...args),
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
  onGradesUiChange: () => coursesRenderer.render(),
});
initDrawer({
  closeOverlays,
  theme,
  showToast,
  onBackupImport: () => backup.importBackup(),
  onBackupExport: () => backup.exportBackup(),
  onEditRoster: () => rosterEditor.open(),
});
initHorizontalGestures();
createSystemBackController({
  beforeDismiss: () => cancelActivePointerGesture('system-back'),
  closeConfirm: () => moreSheet.closeConfirm(),
  dismissPeople: () => people.dismissBack(),
  dismissCourses: () => highlightSubjects.dismissBack() || exams.dismissBack() || courses.dismissBack(),
  dismissAssignments: () => assignments.dismissBack(),
  dismissRosterEditor: () => rosterEditor.dismissBack(),
  closeStudentRecord: () => studentRecord.close(),
  closeMore: () => moreSheet.close(),
  closeFontSize: () => fontSize.close(),
  closeDrawer: () => closeDrawer(),
  exitSeatLandscape: () => seatLandscape.exit(),
});
initScrollThinChrome();
renderNavigation({ animate: false });
