import { elements } from './dom.js';
import { initNavigation, renderNavigation } from './navigation.js';
import { initHorizontalGestures } from './gestures.js';
import { initDrawer, openDrawer } from './drawer.js';
import { initMenuActions } from './toast.js';

elements.today.textContent = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'short'
}).format(new Date());

initNavigation();
initDrawer();
initHorizontalGestures({ openDrawer });
initMenuActions();
renderNavigation({ animate: false });
