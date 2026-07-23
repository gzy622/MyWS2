import { elements } from './dom.js';
import { initNavigation, renderNavigation } from './navigation.js';
import { initHorizontalGestures } from './gestures.js';
import { initDrawer, openDrawer } from './drawer.js';
import { initMenuActions } from './toast.js';
import { initStudentFontSize } from './student-font-size.js';
import { initSeatCanvas } from './seat-canvas.js';
import { createRosterStore } from './roster-store.js';

const rosterStore = createRosterStore();

initNavigation();
initDrawer();
initHorizontalGestures({ openDrawer });
initMenuActions();
initStudentFontSize();
initSeatCanvas();
renderNavigation({ animate: false });
