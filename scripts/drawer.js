import { elements } from './dom.js';
import { setDrawerOpen } from './state.js';

const SHEET_CLOSE_DISTANCE = 88;

let closeBusinessOverlays = () => {};
let drawerTrigger = null;

export function openDrawer() {
  closeBusinessOverlays('drawer');
  drawerTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : elements.menuButton;
  setDrawerOpen(true);
  elements.app.classList.add('drawer-open');
  elements.drawer.inert = false;
  elements.drawer.setAttribute('aria-hidden', 'false');
  elements.closeDrawerButton.focus({ preventScroll: true });
}

export function closeDrawer({ restoreFocus = true } = {}) {
  if (!elements.app.classList.contains('drawer-open')) return;
  setDrawerOpen(false);
  elements.drawer.style.transform = '';
  elements.drawer.classList.remove('dragging');
  elements.app.classList.remove('drawer-open');
  elements.drawer.setAttribute('aria-hidden', 'true');
  elements.drawer.inert = true;
  if (restoreFocus) drawerTrigger?.focus({ preventScroll: true });
  drawerTrigger = null;
}

export function initDrawer({ closeOverlays } = {}) {
  closeBusinessOverlays = closeOverlays ?? (() => {});
  elements.menuButton.addEventListener('click', openDrawer);
  elements.closeDrawerButton.addEventListener('click', () => closeDrawer());
  elements.scrim.addEventListener('click', () => closeDrawer());

  let dragging = false;
  let pointerId;
  let startY = 0;
  let offsetY = 0;

  elements.drawerHandle.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    dragging = true;
    pointerId = event.pointerId;
    startY = event.clientY;
    offsetY = 0;
    elements.drawer.classList.add('dragging');
    elements.drawerHandle.setPointerCapture?.(pointerId);
  });

  elements.drawerHandle.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    offsetY = Math.max(0, event.clientY - startY);
    elements.drawer.style.transform = `translateY(${offsetY}px)`;
    event.preventDefault();
  }, { passive: false });

  const endDrag = (event, cancelled = false) => {
    if (!dragging || (event.pointerId != null && event.pointerId !== pointerId)) return;
    dragging = false;
    elements.drawer.classList.remove('dragging');
    if (!cancelled && offsetY > SHEET_CLOSE_DISTANCE) closeDrawer();
    else elements.drawer.style.transform = '';
    if (elements.drawerHandle.hasPointerCapture?.(pointerId)) elements.drawerHandle.releasePointerCapture(pointerId);
  };

  elements.drawerHandle.addEventListener('pointerup', endDrag);
  elements.drawerHandle.addEventListener('pointercancel', (event) => endDrag(event, true));
  elements.drawerHandle.addEventListener('lostpointercapture', (event) => {
    if (event.target === elements.drawerHandle) endDrag(event, true);
  });
}
