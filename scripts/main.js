import { elements } from './dom.js';
import { initNavigation, renderNavigation } from './navigation.js';
import { initHorizontalGestures } from './gestures.js';
import { closeDrawer, initDrawer } from './drawer.js';
import { showToast } from './toast.js';
import { initStudentFontSize } from './student-font-size.js';
import { initSeatCanvas } from './seat-canvas.js';
import { createRosterStore } from './roster-store.js';
import { initRosterRenderer } from './roster-renderer.js';
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

export const rosterStore = createRosterStore(loadRosterState(), saveRosterState);
const theme = initTheme();
const appViewport = initViewport({ app: elements.app, studentGrid: elements.studentGrid });
initBuildId();
initSheetDebug();

initNavigation({ getActiveAssignmentTitle: () => rosterStore.getCurrentAssignment().name });
const fontSize = initStudentFontSize();
initRosterRenderer(rosterStore);
let studentRecord;
let assignments;
let moreSheet;
function closeOverlays(except) {
  if (except !== 'student-record') studentRecord?.close();
  if (except !== 'assignments') assignments?.close();
  if (except !== 'more') moreSheet?.close({ restoreFocus: false });
  if (except !== 'confirm') moreSheet?.closeConfirm({ restoreFocus: false });
  if (except !== 'font-size') fontSize.close();
  if (except !== 'drawer') closeDrawer({ restoreFocus: false });
}
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
moreSheet = initMoreSheet({ store: rosterStore, showToast, seatCanvas, fontSize, theme, closeOthers: closeOverlays });
initDrawer({ closeOverlays });
initHorizontalGestures();
createSystemBackController({
  closeConfirm: () => moreSheet.closeConfirm(),
  dismissAssignments: () => assignments.dismissBack(),
  closeStudentRecord: () => studentRecord.close(),
  closeMore: () => moreSheet.close(),
  closeFontSize: () => fontSize.close(),
  closeDrawer: () => closeDrawer(),
});
renderNavigation({ animate: false });
