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

const rosterStore = createRosterStore();

initNavigation();
initDrawer();
initHorizontalGestures({ openDrawer });
initMenuActions();
initStudentFontSize();
initRosterRenderer(rosterStore);
initStudentInteractions({ store: rosterStore, showToast });
initSeatCanvas();
renderNavigation({ animate: false });
