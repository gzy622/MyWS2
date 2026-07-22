import { elements } from './dom.js';
import { setDrawerOpen } from './state.js';

export function openDrawer() {
  setDrawerOpen(true);
  elements.app.classList.add('drawer-open');
  elements.drawer.setAttribute('aria-hidden', 'false');
  elements.closeDrawerButton.focus({ preventScroll: true });
}

export function closeDrawer() {
  setDrawerOpen(false);
  elements.drawer.style.transform = '';
  elements.drawer.classList.remove('dragging');
  elements.app.classList.remove('drawer-open');
  elements.drawer.setAttribute('aria-hidden', 'true');
}

export function initDrawer() {
  elements.menuFab.addEventListener('click', openDrawer);
  elements.closeDrawerButton.addEventListener('click', closeDrawer);
  elements.scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrawer();
  });

  let dragging = false;
  let pointerId;
  let startY = 0;
  let offsetY = 0;

  elements.drawerHandle.addEventListener('pointerdown', (event) => {
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
  });

  const endDrag = (event) => {
    if (!dragging || (event.pointerId != null && event.pointerId !== pointerId)) return;
    dragging = false;
    elements.drawer.classList.remove('dragging');
    if (offsetY > 90) closeDrawer();
    else elements.drawer.style.transform = '';
  };

  elements.drawerHandle.addEventListener('pointerup', endDrag);
  elements.drawerHandle.addEventListener('pointercancel', endDrag);
}
