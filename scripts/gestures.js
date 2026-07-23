import { elements } from './dom.js';
import { PAGE_COUNT, state, clampPage, setCurrentPage } from './state.js';
import { renderDrag, renderNavigation } from './navigation.js';

const AXIS_LOCK_DISTANCE = 6;
const NAV_DRAWER_HINT_DISTANCE = 24;
const NAV_DRAWER_OPEN_DISTANCE = 58;
const EDGE_RESISTANCE = 0.28;
const SWIPE_MIN_DISTANCE = 20;
const SWIPE_VELOCITY = 0.35;
const SWIPE_PROJECTION_MS = 120;
export function initHorizontalGestures({ openDrawer }) {
  function horizontalGesture(element, isNav = false) {
    let active = false;
    let pointerId;
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let deltaY = 0;
    let axis = null;
    let sampleX = 0;
    let sampleTime = 0;
    let velocityX = 0;
    let scrollPage = null;
    let startScrollTop = 0;
    let suppressNextClick = false;
    let suppressResetTimer;

    element.addEventListener('pointerdown', (event) => {
      if (state.drawerOpen || event.button > 0 || event.target.closest?.('.seat-viewport')) return;
      active = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      deltaX = 0;
      deltaY = 0;
      axis = null;
      sampleX = event.clientX;
      sampleTime = event.timeStamp;
      velocityX = 0;
      scrollPage = isNav ? null : elements.pageElements[state.currentPage];
      startScrollTop = scrollPage?.scrollTop || 0;
      element.setPointerCapture?.(pointerId);
    });

    element.addEventListener('pointermove', (event) => {
      if (!active || event.pointerId !== pointerId) return;

      const elapsed = event.timeStamp - sampleTime;
      if (elapsed > 0) velocityX = (event.clientX - sampleX) / elapsed;
      sampleX = event.clientX;
      sampleTime = event.timeStamp;
      deltaX = event.clientX - startX;
      deltaY = event.clientY - startY;

      if (!axis && Math.hypot(deltaX, deltaY) > AXIS_LOCK_DISTANCE) {
        axis = Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y';
      }

      if (axis === 'y') {
        if (isNav && deltaY < 0) {
          elements.gestureTip.classList.toggle('show', deltaY < -NAV_DRAWER_HINT_DISTANCE);
        } else if (scrollPage) {
          scrollPage.scrollTop = startScrollTop - deltaY;
        }
        event.preventDefault();
        return;
      }
      if (axis !== 'x') return;

      event.preventDefault();
      let resistedOffset = deltaX;
      if ((state.currentPage === 0 && deltaX > 0) || (state.currentPage === PAGE_COUNT - 1 && deltaX < 0)) {
        resistedOffset *= EDGE_RESISTANCE;
      }
      renderDrag(resistedOffset);
    }, { passive: false });

    const endGesture = (event, cancelled = false) => {
      if (!active || (event.pointerId != null && event.pointerId !== pointerId)) return;
      active = false;
      elements.gestureTip.classList.remove('show');

      const wasGesture = Math.hypot(deltaX, deltaY) > 10;
      if (!cancelled && isNav && axis === 'y' && deltaY < -NAV_DRAWER_OPEN_DISTANCE) {
        openDrawer();
      } else if (!cancelled && axis === 'x') {
        const distanceThreshold = Math.min(56, elements.viewport.clientWidth * 0.14);
        if (event.timeStamp - sampleTime > 80) velocityX = 0;
        const projectedDelta = deltaX + velocityX * SWIPE_PROJECTION_MS;
        const passedDistance = Math.abs(deltaX) > distanceThreshold;
        const passedFlick = Math.abs(deltaX) > SWIPE_MIN_DISTANCE && Math.abs(velocityX) > SWIPE_VELOCITY;

        if (passedDistance || passedFlick) {
          const directionDelta = passedDistance ? deltaX : projectedDelta;
          setCurrentPage(clampPage(state.currentPage + (directionDelta < 0 ? 1 : -1)));
        }
        renderNavigation();
      } else {
        renderNavigation();
      }

      if (wasGesture) {
        suppressNextClick = true;
        clearTimeout(suppressResetTimer);
        suppressResetTimer = setTimeout(() => { suppressNextClick = false; }, 0);
      }

      if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
    };

    element.addEventListener('pointerup', (event) => endGesture(event));
    element.addEventListener('pointercancel', (event) => endGesture(event, true));
    element.addEventListener('lostpointercapture', (event) => endGesture(event, true));
    element.addEventListener('click', (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      clearTimeout(suppressResetTimer);
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  horizontalGesture(elements.viewport);
  horizontalGesture(elements.nav, true);
}
