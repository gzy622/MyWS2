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
  elements.menuDrawer.inert = false;
  elements.menuDrawer.setAttribute('aria-hidden', 'false');
  elements.closeMenuDrawerButton.focus({ preventScroll: true });
}

export function closeDrawer({ restoreFocus = true } = {}) {
  if (!elements.app.classList.contains('drawer-open')) return;
  setDrawerOpen(false);
  elements.menuDrawer.style.transform = '';
  elements.menuDrawer.classList.remove('dragging');
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

  let dragging = false;
  let pointerId;
  let startY = 0;
  let offsetY = 0;

  elements.menuDrawerHandle.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    dragging = true;
    pointerId = event.pointerId;
    startY = event.clientY;
    offsetY = 0;
    elements.menuDrawer.classList.add('dragging');
    elements.menuDrawerHandle.setPointerCapture?.(pointerId);
  });

  elements.menuDrawerHandle.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    offsetY = Math.max(0, event.clientY - startY);
    elements.menuDrawer.style.transform = `translateY(${offsetY}px)`;
    event.preventDefault();
  }, { passive: false });

  const endDrag = (event, cancelled = false) => {
    if (!dragging || (event.pointerId != null && event.pointerId !== pointerId)) return;
    dragging = false;
    elements.menuDrawer.classList.remove('dragging');
    if (!cancelled && offsetY > SHEET_CLOSE_DISTANCE) closeDrawer();
    else elements.menuDrawer.style.transform = '';
    if (elements.menuDrawerHandle.hasPointerCapture?.(pointerId)) elements.menuDrawerHandle.releasePointerCapture(pointerId);
  };

  elements.menuDrawerHandle.addEventListener('pointerup', endDrag);
  elements.menuDrawerHandle.addEventListener('pointercancel', (event) => endDrag(event, true));
  elements.menuDrawerHandle.addEventListener('lostpointercapture', (event) => {
    if (event.target === elements.menuDrawerHandle) endDrag(event, true);
  });
}
