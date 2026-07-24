import { elements } from './dom.js';
import { setDrawerOpen } from './state.js';
import { bindSheetHandleDrag } from './sheet-drag.js';

let closeBusinessOverlays = () => {};
let drawerTrigger = null;
let handleDrag;

export function openDrawer() {
  closeBusinessOverlays('drawer');
  drawerTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : elements.menuButton;
  setDrawerOpen(true);
  elements.app.classList.add('drawer-open');
  elements.menuDrawer.inert = false;
  elements.menuDrawer.setAttribute('aria-hidden', 'false');
  elements.closeMenuDrawerButton.focus({ preventScroll: true });
}

export function closeDrawer({ restoreFocus = true } = {}) {
  if (!elements.app.classList.contains('drawer-open')) return;
  setDrawerOpen(false);
  handleDrag?.reset();
  elements.app.classList.remove('drawer-open');
  elements.menuDrawer.setAttribute('aria-hidden', 'true');
  elements.menuDrawer.inert = true;
  if (restoreFocus) drawerTrigger?.focus({ preventScroll: true });
  drawerTrigger = null;
}

export function initDrawer({ closeOverlays } = {}) {
  closeBusinessOverlays = closeOverlays ?? (() => {});
  elements.menuButton.addEventListener('click', openDrawer);
  elements.closeMenuDrawerButton.addEventListener('click', () => closeDrawer());
  elements.scrim.addEventListener('click', () => closeDrawer());

  handleDrag = bindSheetHandleDrag({
    handle: elements.menuDrawerHandle,
    panel: elements.menuDrawer,
    direction: 'down',
    onClose: () => closeDrawer(),
  });
}
