import { state } from './state.js';
import {
  applyScrollPortDelta,
  findScrollPort,
  getSheet,
  getTopSheet,
  scrollPortCanScroll
} from './sheet-drag.js';
import { haptic, Haptic } from './haptics.js';
import { blurIfSheetChrome } from './focus.js';

const REGISTER_PAGE_INDEX = 1;
const GRID_SUBVIEW_INDEX = 0;

function isRegisterGrid() {
  return state.currentPage === REGISTER_PAGE_INDEX
    && state.subviews[REGISTER_PAGE_INDEX] === GRID_SUBVIEW_INDEX;
}

function isInteractiveField(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
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
    if (event.button > 0) return 'blocked';
    if (state.fontSizePopoverOpen) return 'blocked';
    if (state.activeOverlay === 'more') return 'blocked';
    if (isInteractiveField(event.target)) return 'blocked';

    // Drop any leftover topbar focus ring before a sheet gesture starts.
    if (document.activeElement instanceof HTMLElement
      && document.activeElement.closest?.('.topbar')) {
      blurIfSheetChrome(document.activeElement);
    }

    const top = getTopSheet();
    if (top) {
      // Native-scroll ports keep browser momentum; do not claim the pointer.
      if (findScrollPort(event.target, top.getNativeScrollPorts?.() ?? [])) return null;

      const scrollPort = findScrollPort(event.target, top.getScrollPorts());
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
      return 'sheet';
    }

    if (event.target.closest?.('.seat-viewport')) return 'blocked';

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
      return 'sheet';
    }

    return null;
  }

  function lockSheet(clientY) {
    if (!session?.sheet) return;
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
      session.started = true;
      if (session.scrollPort && scrollPortCanScroll(session.scrollPort, deltaY)) {
        session.scrollLocked = true;
      } else {
        lockSheet(clientY - deltaY);
      }
    }

    if (session.scrollLocked && session.scrollPort) {
      const unused = applyScrollPortDelta(session.scrollPort, deltaY, session.startScrollTop);
      if (Math.abs(unused) > 0.5 && !scrollPortCanScroll(session.scrollPort, deltaY)) {
        lockSheet(clientY);
        session.sheet.moveByDeltaY(0);
      }
      return true;
    }

    if (!session.sheetLocked) lockSheet(clientY - deltaY);
    session.sheet.moveByDeltaY(clientY - session.sheetStartClientY);
    return true;
  }

  function endPointer({ velocityY = 0, cancelled = false } = {}) {
    if (!session) return false;
    const sheet = session.sheet;
    const wasSheet = Boolean(session.started && sheet && sheet.isDragging());
    let openedDrawer = false;

    if (wasSheet) {
      const shouldOpen = sheet.endDrag({ velocityY, cancelled });
      if (shouldOpen && sheet.id === 'drawer') openedDrawer = true;
    }

    clear();
    if (openedDrawer) haptic(Haptic.light);
    return wasSheet;
  }

  return {
    claimPointerDown,
    onAxisY,
    endPointer,
    cancel() {
      if (session?.sheet?.isDragging()) session.sheet.endDrag({ cancelled: true });
      clear();
    },
    isBusy,
    hasSession: () => Boolean(session)
  };
}
