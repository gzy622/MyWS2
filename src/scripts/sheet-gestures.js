import { state } from './state.js';
import {
  applyScrollPortDelta,
  findScrollPort,
  getSheet,
  getTopSheet,
  scrollPortCanScroll,
  startScrollPortInertia,
  stopScrollPortInertia
} from './sheet-drag.js';
import { haptic, Haptic } from './haptics.js';
import { blurIfSheetChrome } from './focus.js';
import { describeDebugTarget, isSheetDebugEnabled, logGestureDebug } from './sheet-debug.js';

const REGISTER_PAGE_INDEX = 1;
const GRID_SUBVIEW_INDEX = 0;

function isRegisterGrid() {
  return state.currentPage === REGISTER_PAGE_INDEX
    && state.subviews[REGISTER_PAGE_INDEX] === GRID_SUBVIEW_INDEX;
}

function isInteractiveField(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
  // Android WebView often hit-tests label / field chrome instead of the <input>.
  // Claiming those as sheet drags steals the tap and blocks the soft keyboard.
  const field = target.closest('label, .course-edit-field, .people-edit-field, .assignment-name-field');
  return Boolean(field?.querySelector('input, textarea, select, [contenteditable="true"]'));
}

/**
 * Course-page controls that open editors.
 * Must not claim Sheet Y-scrub (that swallowed taps / IME), but must NOT return
 * `blocked` either — otherwise horizontal page swipe never starts on the matrix.
 */
function isCourseControl(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(
    '.week-slot-cell, .week-period-label, .grade-score-cell, .grade-subject-head'
  ));
}

/** Buttons/links inside the presented sheet — scrubbing them swallows the click (Save appears dead). */
function isSheetActionControl(target, sheet) {
  if (!(target instanceof Element) || !sheet) return false;
  const root = sheet.layer || sheet.panel;
  if (!root?.contains(target)) return false;
  return Boolean(target.closest(
    'button, a[href], [role="button"], .student-score-keypad [data-score-key]'
  ));
}

/**
 * Dismiss direction for a presented sheet (Material / iOS nested-sheet rule):
 * from-top closes by dragging up; from-bottom closes by dragging down.
 */
function isDismissDeltaY(sheet, deltaY) {
  return sheet?.getDirection?.() === 'from-top' ? deltaY < 0 : deltaY > 0;
}

/**
 * Fully settled open sheets must not rubber-band further open. That false start
 * steals taps (click suppress) and feels sticky on top sheets at list top.
 * Mid-settle / mid-drag / partial reveal still allow both directions.
 */
function shouldLockSheetFromScrub(sheet, deltaY) {
  if (isDismissDeltaY(sheet, deltaY)) return true;
  if (sheet.isSettling?.() || sheet.isDragging?.()) return true;
  if (!sheet.isOpen?.()) return true;
  return false;
}

/**
 * Sheet Y scrub + open-from-grid helpers used by the app gesture router.
 */
export function createSheetGestureBridge() {
  let session = null;

  function clear() {
    session = null;
  }

  function isBusy() {
    return Boolean(session?.sheet?.isDragging());
  }

  /**
   * @returns {'sheet' | 'blocked' | null}
   */
  function claimPointerDown(event) {
    // New contact cancels any coasting list scroll.
    stopScrollPortInertia();

    const hit = describeDebugTarget(event.target);
    const finish = (result, reason) => {
      if (isSheetDebugEnabled()) {
        logGestureDebug('sheet claim', {
          result: result ?? 'pass',
          reason,
          target: hit,
          overlay: state.activeOverlay ?? 'none',
          page: state.currentPage,
          subview: state.subviews[state.currentPage]
        });
      }
      return result;
    };

    if (event.button > 0) return finish('blocked', 'button>0');
    if (state.fontSizePopoverOpen) return finish('blocked', 'fontSizePopover');
    if (state.activeOverlay === 'more') return finish('blocked', 'more');
    if (isInteractiveField(event.target)) return finish('blocked', 'interactiveField');
    // No sheet claim — leave the pointer to the page gesture router (horizontal swipe).
    if (isCourseControl(event.target)) return finish(null, 'courseControl');

    // Drop any leftover topbar focus ring before a sheet gesture starts.
    if (document.activeElement instanceof HTMLElement
      && document.activeElement.closest?.('.topbar')) {
      blurIfSheetChrome(document.activeElement);
    }

    const top = getTopSheet();
    if (top) {
      // Native-scroll ports keep browser momentum; do not claim the pointer.
      // Check before sheetAction — list rows are often <button>s (people-pick).
      if (findScrollPort(event.target, top.getNativeScrollPorts?.() ?? [])) {
        return finish(null, `nativeScroll top=${top.id}`);
      }

      const scrollPort = findScrollPort(event.target, top.getScrollPorts());
      // Save / Cancel / keypad must receive the click; do not start Y-scrub on them.
      // Exception: controls inside a JS scroll port must still be claimable so the
      // list can scrub-scroll (touch-action:none). Taps without drag still click.
      if (isSheetActionControl(event.target, top) && !scrollPort) {
        return finish('blocked', `sheetAction top=${top.id}`);
      }

      session = {
        sheet: top,
        mode: 'scrub',
        started: false,
        scrollPort,
        startScrollTop: scrollPort?.scrollTop ?? 0,
        scrollLocked: false,
        sheetLocked: false,
        sheetStartClientY: 0
      };
      return finish('sheet', `scrub top=${top.id} scrollPort=${Boolean(scrollPort)}`);
    }

    if (event.target.closest?.('.seat-viewport')) return finish('blocked', 'seatViewport');

    if (isRegisterGrid() || event.target.closest?.('#nav')) {
      session = {
        sheet: null,
        mode: 'open',
        started: false,
        allowAssignments: isRegisterGrid(),
        allowDrawer: true,
        scrollPort: null,
        startScrollTop: 0,
        scrollLocked: false,
        sheetLocked: false,
        sheetStartClientY: 0
      };
      return finish('sheet', 'open-from-grid/nav');
    }

    return finish(null, 'no-claim');
  }

  function lockSheet(clientY) {
    if (!session?.sheet) return;
    if (session.scrollPort) stopScrollPortInertia(session.scrollPort);
    session.sheetLocked = true;
    session.scrollLocked = false;
    session.sheetStartClientY = clientY;
    session.sheet.beginDrag();
  }

  function onAxisY({ deltaY, clientY }) {
    if (!session) return false;

    if (session.mode === 'open') {
      if (!session.started) {
        if (deltaY > 0 && session.allowAssignments) {
          session.sheet = getSheet('assignments');
        } else if (deltaY < 0 && session.allowDrawer) {
          session.sheet = getSheet('drawer');
        } else {
          return false;
        }
        if (!session.sheet) return false;
        session.started = true;
        // Anchor at gesture start so full deltaY maps from progress 0.
        lockSheet(clientY - deltaY);
      }
      if (!session.sheet) return false;
      session.sheet.moveByDeltaY(clientY - session.sheetStartClientY);
      return true;
    }

    const sheet = session.sheet;
    if (!sheet) return false;

    if (!session.started) {
      if (session.scrollPort && scrollPortCanScroll(session.scrollPort, deltaY)) {
        session.started = true;
        session.scrollLocked = true;
      } else if (shouldLockSheetFromScrub(sheet, deltaY)) {
        session.started = true;
        lockSheet(clientY - deltaY);
      } else {
        // Open-direction overscroll while fully open: ignore (keep taps alive).
        return true;
      }
    }

    if (session.scrollLocked && session.scrollPort) {
      const unused = applyScrollPortDelta(session.scrollPort, deltaY, session.startScrollTop);
      if (
        Math.abs(unused) > 0.5
        && !scrollPortCanScroll(session.scrollPort, deltaY)
        && shouldLockSheetFromScrub(sheet, deltaY)
      ) {
        lockSheet(clientY);
        session.sheet.moveByDeltaY(0);
      }
      return true;
    }

    if (!session.sheetLocked) {
      if (!shouldLockSheetFromScrub(sheet, deltaY)) return true;
      lockSheet(clientY - deltaY);
    }
    session.sheet.moveByDeltaY(clientY - session.sheetStartClientY);
    return true;
  }

  function endPointer({ velocityY = 0, cancelled = false } = {}) {
    if (!session) return { handled: false, closedSheetId: null, moved: false };
    const sheet = session.sheet;
    const wasSheet = Boolean(session.started && sheet && sheet.isDragging());
    const wasScrollOnly = Boolean(
      session.started && session.scrollLocked && session.scrollPort && !wasSheet
    );
    const moved = Boolean(session.started);
    const scrollPort = session.scrollPort;
    let openedDrawer = false;
    let closedSheetId = null;

    if (wasSheet) {
      const shouldOpen = sheet.endDrag({ velocityY, cancelled });
      if (shouldOpen && sheet.id === 'drawer') openedDrawer = true;
      if (!shouldOpen && session.mode === 'scrub') closedSheetId = sheet.id;
    }

    if (isSheetDebugEnabled() && (session.started || cancelled)) {
      logGestureDebug('sheet release', {
        sheet: sheet?.id ?? 'none',
        mode: session.mode,
        handled: wasSheet,
        scrollOnly: wasScrollOnly,
        cancelled,
        velocityY: Number(velocityY.toFixed(3))
      });
    }

    clear();
    if (wasScrollOnly && !cancelled) startScrollPortInertia(scrollPort, velocityY);
    if (openedDrawer) haptic(Haptic.light);
    return { handled: wasSheet, closedSheetId, moved };
  }

  return {
    claimPointerDown,
    onAxisY,
    endPointer,
    cancel() {
      stopScrollPortInertia();
      if (session?.sheet?.isDragging()) session.sheet.endDrag({ cancelled: true });
      clear();
    },
    isBusy,
    /** True once this pointer started list scroll or sheet drag. */
    hasStarted: () => Boolean(session?.started),
    hasSession: () => Boolean(session)
  };
}
