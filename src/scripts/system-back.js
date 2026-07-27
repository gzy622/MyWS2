import { elements } from './dom.js';
import { state } from './state.js';

/**
 * Close the topmost sheet/overlay. Returns true when something was dismissed.
 * Priority: confirm → course highlight/subject/period/slot/grade → people edit/pick → assignment name → assignments → student-record → more → font-size → drawer → seat landscape
 */
export function createSystemBackController({
  closeConfirm,
  dismissPeople,
  dismissCourses,
  dismissAssignments,
  closeStudentRecord,
  closeMore,
  closeFontSize,
  closeDrawer,
  exitSeatLandscape,
}) {
  function dismissTopLayer() {
    if (elements.confirmSheet.classList.contains('show')) {
      closeConfirm?.();
      return true;
    }
    if (dismissCourses?.()) return true;
    if (dismissPeople?.()) return true;
    if (dismissAssignments?.()) return true;
    if (elements.studentRecordSheet.classList.contains('show')) {
      closeStudentRecord?.();
      return true;
    }
    if (elements.moreMenu.classList.contains('show')) {
      closeMore?.();
      return true;
    }
    if (state.fontSizePopoverOpen) {
      closeFontSize?.();
      return true;
    }
    if (elements.app.classList.contains('drawer-open') || state.drawerOpen) {
      closeDrawer?.();
      return true;
    }
    if (state.seatLandscape) {
      exitSeatLandscape?.();
      return true;
    }
    return false;
  }

  function onEscape(event) {
    if (event.key !== 'Escape') return;
    if (!dismissTopLayer()) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onNativeBack() {
    if (dismissTopLayer()) return;
    const App = globalThis.Capacitor?.Plugins?.App;
    App?.exitApp?.();
  }

  document.addEventListener('keydown', onEscape, true);

  const Capacitor = globalThis.Capacitor;
  let backListener;
  if (Capacitor?.isNativePlatform?.()) {
    const App = Capacitor.Plugins?.App;
    if (App?.addListener) {
      Promise.resolve(App.addListener('backButton', onNativeBack))
        .then((handle) => { backListener = handle; })
        .catch(() => {});
    }
  }

  return {
    dismissTopLayer,
    destroy() {
      document.removeEventListener('keydown', onEscape, true);
      backListener?.remove?.();
    },
  };
}
