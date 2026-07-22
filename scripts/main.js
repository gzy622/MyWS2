import { elements } from './dom.js';
import { initNavigation, renderNavigation } from './navigation.js';
import { initHorizontalGestures } from './gestures.js';
import { initDrawer, openDrawer } from './drawer.js';
import { initMenuActions } from './toast.js';

initNavigation();
initDrawer();
initHorizontalGestures({ openDrawer });
initMenuActions();
renderNavigation({ animate: false });
