import { elements } from './dom.js';
import { setDrawerOpen } from './state.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently } from './focus.js';

let closeBusinessOverlays = () => {};
let drawerTrigger = null;
let sheet;

function setDrawerScrimProgress(progress, mode = 'drag') {
  if (mode === 'clear' || (progress == null && mode !== 'settle')) {
    elements.app.style.removeProperty('--sheet-reveal-progress');
    elements.app.classList.remove('drawer-revealing', 'drawer-settling');
    return;
  }

  if (mode === 'settle') {
    if (!elements.app.classList.contains('drawer-settling')) {
      elements.app.classList.remove('drawer-revealing');
      elements.app.classList.add('drawer-settling');
    }
  } else if (!elements.app.classList.contains('drawer-revealing')) {
    elements.app.classList.add('drawer-revealing');
    elements.app.classList.remove('drawer-settling');
  }

  if (progress != null) {
    const token = (Math.round(progress * 1000) / 1000).toFixed(3);
    if (elements.app.style.getPropertyValue('--sheet-reveal-progress') !== token) {
      elements.app.style.setProperty('--sheet-reveal-progress', token);
    }
  }
}

function syncDrawerChrome(open) {
  setDrawerOpen(open);
  elements.app.classList.toggle('drawer-open', open);
  elements.menuDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  elements.menuDrawer.inert = !open;
  if (!open) {
    elements.menuDrawer.classList.remove('dragging');
    elements.menuDrawer.style.transform = '';
    elements.menuDrawer.style.visibility = '';
  }
}

export function openDrawer() {
  if (sheet?.isOpen() || sheet?.isActive()) return;
  drawerTrigger = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : elements.menuButton;
  sheet.openInstant();
}

export function closeDrawer({ restoreFocus = true } = {}) {
  if (!sheet?.isPresented() && !elements.app.classList.contains('drawer-open')) return;
  if (!restoreFocus) drawerTrigger = null;
  if (sheet?.isPresented()) sheet.closeInstant();
  else {
    syncDrawerChrome(false);
    setDrawerScrimProgress(null, 'clear');
    const focus = drawerTrigger;
    drawerTrigger = null;
    if (restoreFocus && focus) focusSilently(focus);
    else blurIfSheetChrome();
  }
}

export function initDrawer({ closeOverlays } = {}) {
  closeBusinessOverlays = closeOverlays ?? (() => {});
  elements.menuButton.addEventListener('click', openDrawer);
  elements.closeMenuDrawerButton.addEventListener('click', () => closeDrawer());
  elements.scrim.addEventListener('click', () => {
    if (sheet?.isActive()) return;
    closeDrawer();
  });

  sheet = createSheetController({
    id: 'drawer',
    panel: elements.menuDrawer,
    direction: 'from-bottom',
    useShowClass: false,
    scrollPorts: [elements.menuDrawer],
    isOpen: () => elements.app.classList.contains('drawer-open') && !sheet?.isActive(),
    onPrepare({ source } = {}) {
      closeBusinessOverlays('drawer');
      if (source === 'gesture') {
        drawerTrigger = null;
      } else if (!drawerTrigger) {
        drawerTrigger = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : elements.menuButton;
      }
      syncDrawerChrome(true);
    },
    onOpened({ source } = {}) {
      syncDrawerChrome(true);
      setDrawerScrimProgress(null, 'clear');
      if (source === 'control') {
        focusSilently(elements.closeMenuDrawerButton);
      }
    },
    onClosed() {
      syncDrawerChrome(false);
      setDrawerScrimProgress(null, 'clear');
      const focus = drawerTrigger;
      drawerTrigger = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    },
    setScrimProgress: setDrawerScrimProgress
  });
}

export function getDrawerReveal() {
  return sheet;
}

export function getDrawerSheet() {
  return sheet;
}
