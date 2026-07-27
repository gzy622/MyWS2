import { elements } from './dom.js';
import { setDrawerOpen } from './state.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently } from './focus.js';
import { refreshBuildId } from './build-id.js';

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

export function initDrawer({ closeOverlays, theme, showToast, onBackupImport, onBackupExport } = {}) {
  closeBusinessOverlays = closeOverlays ?? (() => {});

  function renderContent() {
    const themeButton = elements.menuDrawer.querySelector('[data-action="toggle-theme"]');
    const themeValue = themeButton?.querySelector('[data-theme-value]');
    const isDark = theme?.get() === 'dark';
    themeButton?.setAttribute('aria-pressed', String(isDark));
    if (themeValue) themeValue.textContent = isDark ? '深色' : '浅色';
  }

  elements.menuButton.addEventListener('click', openDrawer);
  elements.closeMenuDrawerButton.addEventListener('click', () => closeDrawer());
  elements.menuItems.forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'toggle-theme') {
      const nextTheme = theme?.toggle();
      renderContent();
      showToast?.(nextTheme === 'dark' ? '已切换到深色模式' : '已切换到浅色模式');
      return;
    }
    if (action === 'backup-import') { onBackupImport?.(); return; }
    if (action === 'backup-export') { onBackupExport?.(); return; }
  }));
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
      refreshBuildId();
      renderContent();
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
