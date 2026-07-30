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
import {
  applyScrollPortDelta,
  finishClosingSheets,
  getTopSheet,
  isAnySheetDragging,
  startScrollPortInertia
} from './sheet-drag.js';
import { createSheetGestureBridge } from './sheet-gestures.js';
import {
  describeDebugTarget,
  getMotionDebugSnapshot,
  isSheetDebugEnabled,
  logCourseDebug,
  logGestureSession,
  nextGestureSessionId
} from './sheet-debug.js';
import {
  CLICK_SUPPRESS_MS,
  isDragBeyondTap,
  resolveAxisLock,
  resolvePointerRelease
} from './gesture-policy.js';
import { setLetterIndexPageDragging, syncLetterIndexPageVisibility } from './letter-index.js';

const EDGE_RESISTANCE = 0.28;
const SWIPE_MIN_DISTANCE = 20;
const SWIPE_VELOCITY = 0.35;
const SWIPE_PROJECTION_MS = 120;
/** Average pointer velocity over this window to avoid last-frame spikes. */
const VELOCITY_WINDOW_MS = 100;
const VELOCITY_STALE_MS = 80;

/**
 * Controls activated by the gesture router when it claimed the pointer as Sheet.
 * Do not rely on browser click after touch-action:none + optional pointer capture.
 */
const SHEET_TAP_CONTROL_SELECTOR =
  'button, a[href], [role="button"], .student-score-keypad [data-score-key]';

function findSheetTapControl(target) {
  if (!(target instanceof Element)) return null;
  const control = target.closest(SHEET_TAP_CONTROL_SELECTOR);
  if (!control || control.disabled) return null;
  return control;
}

function clampSubview(index) {
  return Math.max(0, Math.min(1, index));
}

function canScrollX(element) {
  return Boolean(element) && element.scrollWidth > element.clientWidth + 1;
}

function canScrollY(element) {
  return Boolean(element) && element.scrollHeight > element.clientHeight + 1;
}

/** Grade table: JS owns dual-axis scroll when the port overflows horizontally. */
function findHorizontalScrollPort(target) {
  if (!(target instanceof Element)) return null;
  const port = target.closest('.grade-scroll');
  return canScrollX(port) ? port : null;
}

/**
 * True when a grades-table swipe starts already at the horizontal edge in the
 * swipe direction — only then may the gesture page-swipe (deferred edge handoff).
 */
function startedAtHorizontalPageEdge(port, startScrollLeft, deltaX) {
  if (!port) return false;
  const max = port.scrollWidth - port.clientWidth;
  if (max <= 1) return true;
  if (deltaX > 0) return startScrollLeft <= 1;
  if (deltaX < 0) return startScrollLeft >= max - 1;
  return false;
}

/**
 * Grades table uses one dual-axis `.grade-scroll` so sticky head/name share a port.
 * Prefer that scroller whenever the gesture starts in the grades subview.
 */
function findVerticalScrollPort(target, pageElement) {
  if (!pageElement) return null;
  if (target instanceof Element && pageElement.contains(target)) {
    const gradesView = target.closest('.page[data-page="2"] .subview[data-view="1"]');
    if (gradesView && pageElement.contains(gradesView)) {
      return gradesView.querySelector('.grade-scroll') || gradesView;
    }
    const nested = target.closest('.subview.active');
    if (nested && pageElement.contains(nested) && canScrollY(nested)) return nested;
  }
  return pageElement;
}

function isGradeScroller(element) {
  return Boolean(element?.classList?.contains('grade-scroll'));
}

function applyHorizontalScrollDelta(port, deltaXFromStart, startScrollLeft) {
  if (!port) return;
  const max = Math.max(0, port.scrollWidth - port.clientWidth);
  port.scrollLeft = Math.min(max, Math.max(0, startScrollLeft - deltaXFromStart));
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
  let horizontalScrollPort = null;
  let startHorizontalScrollLeft = 0;
  /** True once this pointer moved a grades-table scroll port (for release inertia). */
  let gradePortScrolled = false;
  let isNav = false;
  let isSegments = false;
  let blockGestureClick = false;
  let clickSuppressTimer = 0;
  let lastSegment = 0;
  let claim = null;
  /** The first deliberate contact after a gesture-dismiss must not rely on a WebView click. */
  let postSheetCloseTapPending = false;
  let postSheetCloseTapControl = null;
  /** Control under pointerdown when claim === 'sheet'; activated on brief tap. */
  let sheetTapControl = null;
  let startPage = 0;
  let startSubview = 0;
  let gestureTarget = '';
  let gesturePointerType = '';
  let gestureSessionId = '';

  const clearClickSuppression = (clearReason = 'timeout') => {
    const reason = typeof clearReason === 'string' ? clearReason : 'timeout';
    if (blockGestureClick && isSheetDebugEnabled() && gestureSessionId) {
      logGestureSession('click suppress cleared', {
        sessionId: gestureSessionId,
        owner: 'gestures',
        clearReason: reason
      });
    }
    blockGestureClick = false;
    if (clickSuppressTimer) {
      window.clearTimeout(clickSuppressTimer);
      clickSuppressTimer = 0;
    }
  };

  const clearClickSuppressionFromNewContact = () => {
    clearClickSuppression('new-pointerdown');
  };

  const armClickSuppression = () => {
    blockGestureClick = true;
    if (clickSuppressTimer) window.clearTimeout(clickSuppressTimer);
    clickSuppressTimer = window.setTimeout(() => clearClickSuppression('timeout'), CLICK_SUPPRESS_MS);
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
    const followsSheetClose = postSheetCloseTapPending;
    postSheetCloseTapPending = false;
    postSheetCloseTapControl = followsSheetClose ? findSheetTapControl(event.target) : null;
    // Closing overlays already pass hit-testing through. Complete their visual/state
    // lifecycle now so this pointer is routed against the underlying UI.
    finishClosingSheets();
    claim = sheets.claimPointerDown(event);
    sheetTapControl = claim === 'sheet' ? findSheetTapControl(event.target) : null;
    if (claim === 'blocked') return;

    // Horizontal page gestures only when no vertical sheet is presented.
    const topSheet = getTopSheet();
    if (claim !== 'sheet' && topSheet) return;
    if (claim !== 'sheet' && (state.activeOverlay || state.drawerOpen || state.fontSizePopoverOpen)) return;
    if (claim !== 'sheet' && event.target.closest?.('.seat-viewport, .letter-index')) return;
    if (event.button > 0) return;

    const courseHit = event.target.closest?.(
      '.week-slot-cell, .week-period-label, .course-edit-field, .course-slot-sheet, #weekStrip'
    );
    if (courseHit) {
      logCourseDebug('gesture active start', `claim=${claim ?? 'null'} hit=${describeDebugTarget(event.target)}`);
    }

    clearClickSuppression('new-pointerdown');
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
    const pageElement = isNav ? null : elements.pageElements[state.currentPage];
    scrollPage = findVerticalScrollPort(event.target, pageElement);
    startScrollTop = scrollPage?.scrollTop || 0;
    horizontalScrollPort = !isNav && !isSegments
      ? findHorizontalScrollPort(event.target)
      : null;
    startHorizontalScrollLeft = horizontalScrollPort?.scrollLeft || 0;
    gradePortScrolled = false;
    startPage = state.currentPage;
    startSubview = state.subviews[state.currentPage];
    gestureTarget = describeDebugTarget(event.target);
    gesturePointerType = event.pointerType || 'unknown';
    gestureSessionId = nextGestureSessionId();
    if (isSheetDebugEnabled()) {
      logGestureSession('pointer start', {
        sessionId: gestureSessionId,
        owner: 'gestures',
        claim: claim ?? 'pass',
        pointerType: gesturePointerType,
        target: gestureTarget,
        page: startPage,
        subview: startSubview,
        nav: isNav,
        segments: isSegments,
        horizontalScroll: Boolean(horizontalScrollPort)
      });
    }
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

    if (!axis) {
      axis = resolveAxisLock({ deltaX, deltaY });
      if (axis) {
        // Grades table: scroll while it can; page-swipe only from a fresh edge swipe.
        if (
          axis === 'x'
          && horizontalScrollPort
          && startedAtHorizontalPageEdge(horizontalScrollPort, startHorizontalScrollLeft, deltaX)
        ) {
          horizontalScrollPort = null;
        }
        // Sheet claim: capture only after list scroll / sheet drag actually starts.
        // Capturing on every axis lock makes Android WebView omit later clicks.
        // Grades table uses touch-action:none + JS scroll — capture so the browser
        // cannot pointercancel mid-pan (pan-* on the port caused recurring interrupts).
        if (claim !== 'sheet' || axis === 'x' || isGradeScroller(scrollPage)) {
          element.setPointerCapture?.(pointerId);
        }
        if (axis === 'x' && !isSegments && !horizontalScrollPort && claim !== 'sheet') {
          setLetterIndexPageDragging(true);
        }
        if (isSheetDebugEnabled()) {
          logGestureSession('axis locked', {
            sessionId: gestureSessionId,
            owner: 'gestures',
            axis,
            claim: claim ?? 'pass',
            deltaX: Math.round(deltaX),
            deltaY: Math.round(deltaY),
            gradeScroll: isGradeScroller(scrollPage) || Boolean(horizontalScrollPort)
          });
        }
      }
    }

    if (axis === 'y') {
      if (claim === 'sheet') {
        const handled = sheets.onAxisY({
          deltaY,
          clientY: event.clientY,
          velocityY
        });
        if (handled) {
          if (sheets.hasStarted() && !element.hasPointerCapture?.(pointerId)) {
            element.setPointerCapture?.(pointerId);
          }
          event.preventDefault();
          return;
        }
      }
      if (sheets.isBusy() || isAnySheetDragging() || getTopSheet()) {
        event.preventDefault();
        return;
      }
      if (scrollPage) {
        if (isGradeScroller(scrollPage)) {
          applyScrollPortDelta(scrollPage, deltaY, startScrollTop);
          gradePortScrolled = true;
        } else {
          scrollPage.scrollTop = startScrollTop - deltaY;
        }
      }
      event.preventDefault();
      return;
    }

    if (axis !== 'x') return;
    if (claim === 'sheet' && sheets.isBusy()) return;
    if (getTopSheet()) return;

    if (horizontalScrollPort) {
      applyHorizontalScrollDelta(horizontalScrollPort, deltaX, startHorizontalScrollLeft);
      gradePortScrolled = true;
      event.preventDefault();
      return;
    }

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

    const wasGesture = isDragBeyondTap({ deltaX, deltaY });
    const endedClaim = claim;
    let handledSheet = false;
    let sheetMoved = false;

    if (claim === 'sheet') {
      if (event.timeStamp - sampleTime > VELOCITY_STALE_MS) velocityY = 0;
      else velocityY = readTrailVelocity('y');
      const sheetResult = sheets.endPointer({ velocityY, cancelled });
      handledSheet = sheetResult.handled;
      sheetMoved = Boolean(sheetResult.moved);
      if (sheetResult.closedSheetId) postSheetCloseTapPending = true;
    }

    const release = resolvePointerRelease({
      cancelled,
      wasGesture,
      sheetMoved,
      handledSheet,
      claim: endedClaim,
      hasSheetTapControl: Boolean(sheetTapControl),
      hasPostSheetCloseControl: Boolean(postSheetCloseTapControl)
    });
    // Sheet claim owns the pointer: brief taps activate here; do not wait for browser click.
    const immediateSheetControl = release.activationSource === 'sheet-tap'
      ? sheetTapControl
      : null;
    const immediatePostSheetControl = release.activationSource === 'post-sheet-close-tap'
      ? postSheetCloseTapControl
      : null;

    // Settle page/segment swipes from the current delta even on pointercancel.
    // Grades-table pans used to end in cancel when pan-* fought JS page swipe.
    if (!handledSheet && axis === 'x' && !horizontalScrollPort && !getTopSheet()) {
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
      syncLetterIndexPageVisibility();
    } else if (!handledSheet) {
      renderNavigation();
      syncLetterIndexPageVisibility();
    } else {
      syncLetterIndexPageVisibility();
    }

    if (isSheetDebugEnabled()) {
      logGestureSession('pointer release', {
        sessionId: gestureSessionId,
        owner: 'gestures',
        activationSource: release.activationSource,
        clearReason: release.clearReason,
        pointerType: gesturePointerType,
        target: gestureTarget,
        cancelled,
        axis: axis ?? 'none',
        claim: endedClaim ?? 'pass',
        handledSheet,
        sheetMoved,
        sheetTap: Boolean(immediateSheetControl),
        deltaX: Math.round(deltaX),
        deltaY: Math.round(deltaY),
        started: { page: startPage, subview: startSubview },
        ended: { page: state.currentPage, subview: state.subviews[state.currentPage] },
        motion: getMotionDebugSnapshot(elements.pages)
      });
    }

    isNav = false;
    isSegments = false;
    const scrolledGradePort = gradePortScrolled && isGradeScroller(scrollPage) ? scrollPage : null;
    const shouldCoastGrade = Boolean(
      scrolledGradePort && axis === 'y' && !handledSheet && !cancelled
    );
    const gradeVelocityY = shouldCoastGrade
      ? (event.timeStamp - sampleTime > VELOCITY_STALE_MS ? 0 : readTrailVelocity('y'))
      : 0;
    horizontalScrollPort = null;
    startHorizontalScrollLeft = 0;
    gradePortScrolled = false;
    claim = null;
    postSheetCloseTapControl = null;
    const tapControl = immediateSheetControl || immediatePostSheetControl;
    sheetTapControl = null;

    if (shouldCoastGrade) {
      startScrollPortInertia(scrolledGradePort, gradeVelocityY);
    }

    if (tapControl) {
      if (isSheetDebugEnabled()) {
        logGestureSession('sheet tap', {
          sessionId: gestureSessionId,
          owner: 'gestures',
          activationSource: release.activationSource,
          target: describeDebugTarget(tapControl)
        });
      }
      tapControl.click();
    }
    // Suppress trailing browser click after drag, sheet move, or gesture-owned activation.
    if (release.armClickSuppress) {
      const courseHit = event.target?.closest?.(
        '.week-slot-cell, .week-period-label, .course-edit-field, .course-slot-sheet, #weekStrip'
      );
      if (courseHit) {
        logCourseDebug('click suppress armed', `wasGesture=${wasGesture} handledSheet=${handledSheet} claim=${endedClaim ?? 'null'} hit=${describeDebugTarget(event.target)} Δ=${Math.round(Math.hypot(deltaX, deltaY))}`);
      }
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
  // Clear a previous gesture's trailing-click guard at the earliest boundary
  // of a deliberate new contact, before any child can stop propagation.
  document.addEventListener('pointerdown', clearClickSuppressionFromNewContact, true);
  document.addEventListener('touchstart', clearClickSuppressionFromNewContact, { capture: true, passive: true });
  element.addEventListener('keydown', () => clearClickSuppression('keydown'), true);
  element.addEventListener('click', (event) => {
    if (!blockGestureClick) return;
    if (event.target?.closest?.('.week-slot-cell, .week-period-label, .course-edit-field, #weekStrip')) {
      logCourseDebug('click swallowed by gesture', describeDebugTarget(event.target));
    }
    clearClickSuppression('swallowed-click');
    event.preventDefault();
    event.stopPropagation();
  }, true);
}
