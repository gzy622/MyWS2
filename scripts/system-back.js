import { elements } from './dom.js';
import { state } from './state.js';

/**
 * Close the topmost sheet/overlay. Returns true when something was dismissed.
 * Priority: confirm → assignment rename → assignments → student-record → more → font-size → drawer
 */
export function createSystemBackController({
  closeConfirm,
  dismissAssignments,
  closeStudentRecord,
  closeMore,
  closeFontSize,
  closeDrawer,
}) {
  function dismissTopLayer() {
    if (elements.confirmOverlay.classList.contains('show')) {
      closeConfirm?.();
      return true;
    }
    if (dismissAssignments?.()) return true;
    if (elements.studentRecordOverlay.classList.contains('show')) {
      closeStudentRecord?.();
      return true;
    }
    if (elements.moreOverlay.classList.contains('show')) {
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
