import { elements } from './dom.js';
import { initNavigation, renderNavigation } from './navigation.js';
import { initHorizontalGestures } from './gestures.js';
import { initDrawer, openDrawer } from './drawer.js';
import { initMenuActions, showToast } from './toast.js';
import { initStudentFontSize } from './student-font-size.js';
import { initSeatCanvas } from './seat-canvas.js';
import { createRosterStore } from './roster-store.js';
import { initRosterRenderer } from './roster-renderer.js';
import { initStudentInteractions } from './student-interactions.js';
import { initStudentRecord } from './student-record.js';
import { initAssignments } from './assignments.js';

const rosterStore = createRosterStore();

initNavigation();
initDrawer();
initHorizontalGestures({ openDrawer });
initMenuActions();
initStudentFontSize();
initRosterRenderer(rosterStore);
const studentRecord = initStudentRecord({ store: rosterStore, showToast });
initAssignments({ store: rosterStore, showToast });
initStudentInteractions({ store: rosterStore, showToast, openStudentRecord: studentRecord.open });
initSeatCanvas();
renderNavigation({ animate: false });
