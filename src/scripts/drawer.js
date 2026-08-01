import { elements } from './dom.js';
import { setDrawerOpen } from './state.js';
import { focusSilently, syncChromeInert } from './focus.js';
import { refreshBuildId } from './build-id.js';

let closeBusinessOverlays = () => {};
let drawerTrigger = null;
let renderDrawerContent;

function syncDrawerChrome(open) {
  setDrawerOpen(open);
  elements.app.classList.toggle('drawer-open', open);
  elements.menuDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  elements.menuDrawer.inert = !open;
  elements.settingsButton.setAttribute('aria-expanded', String(open));
  syncChromeInert();
}

export function openDrawer({ returnFocus } = {}) {
  if (elements.app.classList.contains('drawer-open')) return;
  drawerTrigger = returnFocus ?? (document.activeElement instanceof HTMLElement
    ? document.activeElement
    : elements.settingsButton);
  closeBusinessOverlays('drawer');
  refreshBuildId();
  renderDrawerContent?.();
  syncDrawerChrome(true);
  focusSilently(elements.closeMenuDrawerButton);
}

export function closeDrawer({ restoreFocus = true } = {}) {
  if (!elements.app.classList.contains('drawer-open')) return;
  const focus = restoreFocus ? drawerTrigger : null;
  drawerTrigger = null;
  syncDrawerChrome(false);
  if (focus) focusSilently(focus);
}

export function initDrawer({
  closeOverlays,
  theme,
  showToast,
  onBackupImport,
  onBackupExport,
  onEditRoster
} = {}) {
  closeBusinessOverlays = closeOverlays ?? (() => {});

  function renderContent() {
    const themeButton = elements.menuDrawer.querySelector('[data-action="toggle-theme"]');
    const themeValue = themeButton?.querySelector('[data-theme-value]');
    const isDark = theme?.get() === 'dark';
    themeButton?.setAttribute('aria-pressed', String(isDark));
    if (themeValue) themeValue.textContent = isDark ? '深色' : '浅色';
  }
  renderDrawerContent = renderContent;

  elements.settingsButton.addEventListener('click', () => openDrawer());
  elements.closeMenuDrawerButton.addEventListener('click', () => closeDrawer());
  elements.menuItems.forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'toggle-theme') {
      const nextTheme = theme?.toggle();
      renderContent();
      showToast?.(nextTheme === 'dark' ? '已切换到深色模式' : '已切换到浅色模式');
      return;
    }
    if (action === 'edit-roster') {
      onEditRoster?.({ returnFocus: button });
      return;
    }
    if (action === 'backup-import') { onBackupImport?.(); return; }
    if (action === 'backup-export') { onBackupExport?.(); return; }
  }));
}
