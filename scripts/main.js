import { elements } from './dom.js';
import { initNavigation, renderNavigation } from './navigation.js';
import { initHorizontalGestures } from './gestures.js';
import { initDrawer, openDrawer } from './drawer.js';
import { initMenuActions } from './toast.js';
import { initStudentFontSize } from './student-font-size.js';

initNavigation();
initDrawer();
initHorizontalGestures({ openDrawer });
initMenuActions();
initStudentFontSize();
renderNavigation({ animate: false });
