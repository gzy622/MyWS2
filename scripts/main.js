import { elements } from './dom.js';
import { initNavigation, renderNavigation } from './navigation.js';
import { initHorizontalGestures } from './gestures.js';
import { initDrawer, openDrawer } from './drawer.js';
import { initMenuActions } from './toast.js';

const now = new Date();
elements.today.dateTime = now.toISOString().slice(0, 10);
elements.today.textContent = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'short'
}).format(now);

initNavigation();
initDrawer();
initHorizontalGestures({ openDrawer });
initMenuActions();
renderNavigation({ animate: false });
