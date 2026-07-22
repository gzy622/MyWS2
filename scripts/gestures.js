import { elements } from './dom.js';
import { PAGE_COUNT, state, clampPage, setCurrentPage, setSuppressNavClick } from './state.js';
import { renderDrag, renderNavigation } from './navigation.js';

const AXIS_LOCK_DISTANCE = 8;
const AXIS_DOMINANCE_RATIO = 1.15;
const NAV_DRAWER_HINT_DISTANCE = 24;
const NAV_DRAWER_OPEN_DISTANCE = 58;
const EDGE_RESISTANCE = 0.28;
const CLICK_SUPPRESSION_MS = 80;

export function initHorizontalGestures({ openDrawer }) {
  function horizontalGesture(element, isNav = false) {
    let active = false;
    let pointerId;
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let deltaY = 0;
    let axis = null;

    element.addEventListener('pointerdown', (event) => {
      if (state.drawerOpen || event.button > 0) return;
      active = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      deltaX = 0;
      deltaY = 0;
      axis = null;
      element.setPointerCapture?.(pointerId);
    });

    element.addEventListener('pointermove', (event) => {
      if (!active || event.pointerId !== pointerId) return;
      deltaX = event.clientX - startX;
      deltaY = event.clientY - startY;
      if (!axis && Math.hypot(deltaX, deltaY) > AXIS_LOCK_DISTANCE) {
        axis = Math.abs(deltaX) > Math.abs(deltaY) * AXIS_DOMINANCE_RATIO ? 'x' : 'y';
      }
      if (isNav && axis === 'y' && deltaY < 0) {
        elements.gestureTip.classList.toggle('show', deltaY < -NAV_DRAWER_HINT_DISTANCE);
      }
      if (axis !== 'x') return;

      event.preventDefault();
      let resistedOffset = deltaX;
      if ((state.currentPage === 0 && deltaX > 0) || (state.currentPage === PAGE_COUNT - 1 && deltaX < 0)) {
        resistedOffset *= EDGE_RESISTANCE;
      }
      renderDrag(resistedOffset);
    }, { passive: false });

    const endGesture = (event) => {
      if (!active || (event.pointerId != null && event.pointerId !== pointerId)) return;
      active = false;
      elements.gestureTip.classList.remove('show');
      const wasGesture = Math.hypot(deltaX, deltaY) > 10;

      if (isNav && axis === 'y' && deltaY < -NAV_DRAWER_OPEN_DISTANCE) {
        openDrawer();
      } else if (axis === 'x') {
        const threshold = Math.min(72, elements.viewport.clientWidth * 0.2);
        if (Math.abs(deltaX) > threshold) {
          setCurrentPage(clampPage(state.currentPage + (deltaX < 0 ? 1 : -1)));
        }
        renderNavigation();
      } else {
        renderNavigation();
      }

      if (wasGesture) {
        setSuppressNavClick(true);
        setTimeout(() => setSuppressNavClick(false), CLICK_SUPPRESSION_MS);
      }
    };

    element.addEventListener('pointerup', endGesture);
    element.addEventListener('pointercancel', endGesture);
  }

  horizontalGesture(elements.viewport);
  horizontalGesture(elements.nav, true);
}
