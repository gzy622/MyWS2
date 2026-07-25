import { elements } from './dom.js';
import { PAGE_COUNT, state, clampPage, setCurrentPage, setSubview } from './state.js';
import {
  renderDrag,
  renderNavigation,
  renderNavDrag,
  renderSegmentDrag,
  getSegmentGliderWidth
} from './navigation.js';
import { haptic, Haptic } from './haptics.js';
import { getTopSheet, isAnySheetDragging } from './sheet-drag.js';
import { createSheetGestureBridge } from './sheet-gestures.js';

const AXIS_LOCK_DISTANCE = 6;
const EDGE_RESISTANCE = 0.28;
const SWIPE_MIN_DISTANCE = 20;
const SWIPE_VELOCITY = 0.35;
const SWIPE_PROJECTION_MS = 120;
/** Average pointer velocity over this window to avoid last-frame spikes. */
const VELOCITY_WINDOW_MS = 100;
const VELOCITY_STALE_MS = 80;
/** Keep click blocked until after the synthetic click from touch/pointerup. */
const CLICK_SUPPRESS_MS = 450;

function clampSubview(index) {
  return Math.max(0, Math.min(1, index));
}

export function initHorizontalGestures() {
  const sheets = createSheetGestureBridge();

  let active = false;
  let pointerId;
  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let axis = null;
  let sampleX = 0;
  let sampleY = 0;
  let sampleTime = 0;
  let velocityX = 0;
  let velocityY = 0;
  /** @type {{ t: number, x: number, y: number }[]} */
  let velocityTrail = [];
  let scrollPage = null;
  let startScrollTop = 0;
  let isNav = false;
  let isSegments = false;
  let blockGestureClick = false;
  let clickSuppressTimer = 0;
  let lastSegment = 0;
  let claim = null;

  const clearClickSuppression = () => {
    blockGestureClick = false;
    if (clickSuppressTimer) {
      window.clearTimeout(clickSuppressTimer);
      clickSuppressTimer = 0;
    }
  };

  const armClickSuppression = () => {
    blockGestureClick = true;
    if (clickSuppressTimer) window.clearTimeout(clickSuppressTimer);
    clickSuppressTimer = window.setTimeout(clearClickSuppression, CLICK_SUPPRESS_MS);
  };

  function pushVelocitySample(timeStamp, x, y) {
    velocityTrail.push({ t: timeStamp, x, y });
    const oldest = timeStamp - VELOCITY_WINDOW_MS;
    while (velocityTrail.length > 2 && velocityTrail[0].t < oldest) {
      velocityTrail.shift();
    }
  }

  function readTrailVelocity(axisName) {
    if (velocityTrail.length < 2) return 0;
    const first = velocityTrail[0];
    const last = velocityTrail[velocityTrail.length - 1];
    const elapsed = last.t - first.t;
    if (elapsed < 18) return 0;
    if (axisName === 'x') return (last.x - first.x) / elapsed;
    return (last.y - first.y) / elapsed;
  }

  const element = elements.app;

  element.addEventListener('pointerdown', (event) => {
    claim = sheets.claimPointerDown(event);
    if (claim === 'blocked') return;

    // Horizontal page gestures only when no vertical sheet is presented.
    const topSheet = getTopSheet();
    if (claim !== 'sheet' && topSheet) return;
    if (claim !== 'sheet' && (state.activeOverlay || state.drawerOpen || state.fontSizePopoverOpen)) return;
    if (claim !== 'sheet' && event.target.closest?.('.seat-viewport')) return;
    if (event.button > 0) return;

    clearClickSuppression();
    active = true;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    deltaX = 0;
    deltaY = 0;
    axis = null;
    sampleX = event.clientX;
    sampleY = event.clientY;
    sampleTime = event.timeStamp;
    velocityX = 0;
    velocityY = 0;
    velocityTrail = [{ t: event.timeStamp, x: event.clientX, y: event.clientY }];
    isNav = Boolean(event.target.closest?.('#nav'));
    isSegments = !isNav && Boolean(event.target.closest?.('.segments'));
    lastSegment = isSegments ? state.subviews[state.currentPage] : state.currentPage;
    scrollPage = isNav ? null : elements.pageElements[state.currentPage];
    startScrollTop = scrollPage?.scrollTop || 0;
  });

  element.addEventListener('pointermove', (event) => {
    if (!active || event.pointerId !== pointerId) return;

    pushVelocitySample(event.timeStamp, event.clientX, event.clientY);
    velocityX = readTrailVelocity('x');
    velocityY = readTrailVelocity('y');
    sampleX = event.clientX;
    sampleY = event.clientY;
    sampleTime = event.timeStamp;
    deltaX = event.clientX - startX;
    deltaY = event.clientY - startY;

    if (!axis && Math.hypot(deltaX, deltaY) > AXIS_LOCK_DISTANCE) {
      axis = Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y';
      element.setPointerCapture?.(pointerId);
    }

    if (axis === 'y') {
      if (claim === 'sheet') {
        const handled = sheets.onAxisY({
          deltaY,
          clientY: event.clientY,
          velocityY
        });
        if (handled) {
          event.preventDefault();
          return;
        }
      }
      if (sheets.isBusy() || isAnySheetDragging() || getTopSheet()) {
        event.preventDefault();
        return;
      }
      if (scrollPage) {
        scrollPage.scrollTop = startScrollTop - deltaY;
      }
      event.preventDefault();
      return;
    }

    if (axis !== 'x') return;
    if (claim === 'sheet' && sheets.isBusy()) return;
    if (getTopSheet()) return;

    event.preventDefault();
    let resistedOffset = deltaX;
    const currentSub = state.subviews[state.currentPage];
    const isPastStart = isSegments
      ? currentSub === 0 && deltaX < 0
      : state.currentPage === 0 && (isNav ? deltaX < 0 : deltaX > 0);
    const isPastEnd = isSegments
      ? currentSub === 1 && deltaX > 0
      : state.currentPage === PAGE_COUNT - 1 && (isNav ? deltaX > 0 : deltaX < 0);
    if (isPastStart || isPastEnd) {
      resistedOffset *= EDGE_RESISTANCE;
    }
    if (isSegments) {
      renderSegmentDrag(resistedOffset);
      const segmentWidth = getSegmentGliderWidth();
      if (segmentWidth > 0) {
        const segment = clampSubview(Math.round(currentSub + resistedOffset / segmentWidth));
        if (segment !== lastSegment) {
          lastSegment = segment;
          haptic(Haptic.light);
        }
      }
    } else if (isNav) {
      renderNavDrag(resistedOffset);
      const navSegmentWidth = elements.glider.offsetWidth || elements.nav.clientWidth / PAGE_COUNT;
      if (navSegmentWidth > 0) {
        const segment = clampPage(Math.round(state.currentPage + resistedOffset / navSegmentWidth));
        if (segment !== lastSegment) {
          lastSegment = segment;
          haptic(Haptic.light);
        }
      }
    } else {
      renderDrag(resistedOffset);
    }
  }, { passive: false });

  const endGesture = (event, cancelled = false) => {
    if (!active || (event.pointerId != null && event.pointerId !== pointerId)) return;
    active = false;

    const wasGesture = Math.hypot(deltaX, deltaY) > 10;
    let handledSheet = false;

    if (claim === 'sheet') {
      if (event.timeStamp - sampleTime > VELOCITY_STALE_MS) velocityY = 0;
      else velocityY = readTrailVelocity('y');
      handledSheet = sheets.endPointer({ velocityY, cancelled });
    }

    if (!handledSheet && !cancelled && axis === 'x' && !getTopSheet()) {
      const distanceThreshold = Math.min(56, elements.viewport.clientWidth * 0.14);
      if (event.timeStamp - sampleTime > VELOCITY_STALE_MS) velocityX = 0;
      else velocityX = readTrailVelocity('x');
      const projectedDelta = deltaX + velocityX * SWIPE_PROJECTION_MS;
      const passedDistance = Math.abs(deltaX) > distanceThreshold;
      const passedFlick = Math.abs(deltaX) > SWIPE_MIN_DISTANCE && Math.abs(velocityX) > SWIPE_VELOCITY;

      if (isSegments) {
        const pageIndex = state.currentPage;
        const currentSub = state.subviews[pageIndex];
        const segmentWidth = getSegmentGliderWidth(pageIndex);
        let resistedOffset = deltaX;
        if ((currentSub === 0 && deltaX < 0) || (currentSub === 1 && deltaX > 0)) {
          resistedOffset *= EDGE_RESISTANCE;
        }
        let nextSub = currentSub;
        if (passedDistance || passedFlick) {
          const directionDelta = passedDistance ? deltaX : projectedDelta;
          nextSub = passedDistance
            ? clampSubview(Math.round(currentSub + resistedOffset / segmentWidth))
            : clampSubview(currentSub + Math.sign(directionDelta));
        } else {
          nextSub = clampSubview(Math.round(currentSub + resistedOffset / segmentWidth));
        }
        setSubview(pageIndex, nextSub);
      } else if (passedDistance || passedFlick) {
        const directionDelta = passedDistance ? deltaX : projectedDelta;
        const navSegmentWidth = elements.glider.offsetWidth || elements.nav.clientWidth / PAGE_COUNT;
        const navPageDelta = passedDistance
          ? Math.round(deltaX / navSegmentWidth) || Math.sign(directionDelta)
          : Math.sign(directionDelta);
        const pageDelta = isNav ? navPageDelta : (directionDelta < 0 ? 1 : -1);
        setCurrentPage(clampPage(state.currentPage + pageDelta));
      }
      renderNavigation();
    } else if (!handledSheet) {
      renderNavigation();
    }

    isNav = false;
    isSegments = false;
    claim = null;

    // Suppress the trailing click after touch drag/sheet scrub (do not clear via microtask).
    if (wasGesture || handledSheet) {
      armClickSuppression();
      event.preventDefault();
    }

    if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
  };

  element.addEventListener('pointerup', (event) => endGesture(event));
  element.addEventListener('pointercancel', (event) => endGesture(event, true));
  element.addEventListener('lostpointercapture', (event) => {
    if (event.target === element) endGesture(event, true);
  });
  element.addEventListener('keydown', clearClickSuppression, true);
  element.addEventListener('click', (event) => {
    if (!blockGestureClick) return;
    clearClickSuppression();
    event.preventDefault();
    event.stopPropagation();
  }, true);
}
