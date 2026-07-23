import { elements } from './dom.js';
import { closeDrawer } from './drawer.js';
import { setPage, setSub } from './navigation.js';
import { state, setActiveOverlay } from './state.js';

const REGISTER_PAGE_INDEX = 1;
const GRID_SUBVIEW_INDEX = 0;
const SEAT_SUBVIEW_INDEX = 1;

export function initMoreSheet({ store, showToast, seatCanvas, fontSize, closeOthers }) {
  let trigger = null;
  let confirmAction = null;
  let confirmReturnFocus = null;

  function close({ restoreFocus = true } = {}) {
    if (!elements.moreOverlay.classList.contains('show')) return;
    elements.moreOverlay.classList.remove('show');
    elements.moreOverlay.setAttribute('aria-hidden', 'true');
    elements.moreOverlay.inert = true;
    elements.moreButton.setAttribute('aria-expanded', 'false');
    setActiveOverlay(null);
    if (restoreFocus) trigger?.focus({ preventScroll: true });
    trigger = null;
  }

  function closeConfirm({ restoreFocus = true } = {}) {
    if (!elements.confirmOverlay.classList.contains('show')) return;
    elements.confirmOverlay.classList.remove('show');
    elements.confirmOverlay.setAttribute('aria-hidden', 'true');
    elements.confirmOverlay.inert = true;
    setActiveOverlay(null);
    if (restoreFocus) confirmReturnFocus?.focus({ preventScroll: true });
    confirmAction = null;
    confirmReturnFocus = null;
  }

  function confirm({ title, message, action, returnFocus }) {
    close({ restoreFocus: false });
    closeDrawer({ restoreFocus: false });
    closeOthers?.('confirm');
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    confirmAction = action;
    confirmReturnFocus = returnFocus;
    setActiveOverlay('confirm');
    elements.confirmOverlay.classList.add('show');
    elements.confirmOverlay.setAttribute('aria-hidden', 'false');
    elements.confirmOverlay.inert = false;
    elements.cancelConfirmButton.focus({ preventScroll: true });
  }

  function render() {
    const isGrid = state.subviews[REGISTER_PAGE_INDEX] === GRID_SUBVIEW_INDEX;
    const isSeats = state.subviews[REGISTER_PAGE_INDEX] === SEAT_SUBVIEW_INDEX;
    for (const button of elements.moreActions) {
      const action = button.dataset.moreAction;
      button.hidden = (action === 'font-size' && !isGrid)
        || ((action === 'seat-edit' || action === 'seat-reset') && !isSeats);
      if (action === 'seat-edit') {
        button.setAttribute('aria-pressed', String(state.seatEditing));
        button.querySelector('b').textContent = state.seatEditing ? '退出编辑模式' : '编辑座位表';
        button.querySelector('small').textContent = state.seatEditing ? '返回查看和登记模式' : '拖动学生可调整座位';
      }
    }
  }

  function open() {
    if (state.currentPage !== REGISTER_PAGE_INDEX) {
      showToast('更多功能即将推出');
      return;
    }
    closeOthers?.('more');
    closeDrawer({ restoreFocus: false });
    fontSize.close();
    trigger = elements.moreButton;
    render();
    setActiveOverlay('more');
    elements.moreOverlay.classList.add('show');
    elements.moreOverlay.setAttribute('aria-hidden', 'false');
    elements.moreOverlay.inert = false;
    elements.moreButton.setAttribute('aria-expanded', 'true');
    elements.closeMoreButton.focus({ preventScroll: true });
  }

  async function copyMissingStudents() {
    const missing = store.getMissingStudents();
    closeDrawer({ restoreFocus: false });
    if (!missing.length) {
      showToast('全部已交，无需复制');
      elements.menuButton.focus({ preventScroll: true });
      return;
    }
    try {
      await navigator.clipboard.writeText(missing.map(({ name }) => name).join('、'));
      showToast(`已复制 ${missing.length} 名未交学生`);
    } catch {
      showToast('复制失败，请检查剪贴板权限');
    }
    elements.menuButton.focus({ preventScroll: true });
  }

  function handleMenuAction(button) {
    const action = button.dataset.action;
    if (action === 'view-grid' || action === 'view-seats') {
      closeDrawer({ restoreFocus: false });
      setPage(REGISTER_PAGE_INDEX);
      setSub(REGISTER_PAGE_INDEX, action === 'view-grid' ? GRID_SUBVIEW_INDEX : SEAT_SUBVIEW_INDEX);
      showToast(action === 'view-grid' ? '已切换到网格' : '已切换到座位表');
      return;
    }
    if (action === 'mark-all') {
      closeDrawer({ restoreFocus: false });
      showToast(store.markAllCompleted() ? '已全部标记完成' : '当前作业已全部完成');
      elements.menuButton.focus({ preventScroll: true });
      return;
    }
    if (action === 'clear-all') {
      confirm({
        title: '清除全部标记？',
        message: '将清除当前作业的全部完成状态和分数。',
        action: () => showToast(store.clearCurrentAssignment() ? '已清除当前作业记录' : '当前作业没有记录'),
        returnFocus: elements.menuButton
      });
      return;
    }
    if (action === 'copy-missing') {
      copyMissingStudents();
      return;
    }
    if (action === 'reset-roster') {
      confirm({
        title: '恢复默认名单和座位？',
        message: '将恢复默认名单与座位，并清除所有作业的登记和分数。',
        action: () => { store.resetRoster(); seatCanvas.reset(); showToast('已恢复默认名单和座位'); },
        returnFocus: elements.menuButton
      });
    }
  }

  elements.moreButton.addEventListener('click', open);
  elements.closeMoreButton.addEventListener('click', () => close());
  elements.moreOverlay.addEventListener('click', (event) => { if (event.target === elements.moreOverlay) close(); });
  elements.moreActions.forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const action = button.dataset.moreAction;
    if (action === 'theme') {
      showToast('主题设置将在下一阶段启用');
      return;
    }
    if (action === 'clear-assignment') {
      confirm({
        title: '清除当前作业？',
        message: '将清除当前作业的全部完成状态和分数。',
        action: () => showToast(store.clearCurrentAssignment() ? '已清除当前作业记录' : '当前作业没有记录'),
        returnFocus: elements.moreButton
      });
      return;
    }
    if (action === 'font-size') {
      close({ restoreFocus: false });
      fontSize.open();
      return;
    }
    if (action === 'seat-edit') {
      seatCanvas.setEditing(!state.seatEditing);
      close();
      showToast(state.seatEditing ? '已进入座位编辑模式' : '已退出座位编辑模式');
      return;
    }
    if (action === 'seat-reset') {
      seatCanvas.reset();
      close();
      showToast('座位视图已复位');
    }
  }));
  elements.menuItems.forEach((button) => button.addEventListener('click', () => handleMenuAction(button)));
  elements.cancelConfirmButton.addEventListener('click', () => closeConfirm());
  elements.acceptConfirmButton.addEventListener('click', () => {
    const action = confirmAction;
    const returnFocus = confirmReturnFocus;
    closeConfirm({ restoreFocus: false });
    action?.();
    returnFocus?.focus({ preventScroll: true });
  });
  elements.confirmOverlay.addEventListener('click', (event) => { if (event.target === elements.confirmOverlay) closeConfirm(); });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (elements.confirmOverlay.classList.contains('show')) closeConfirm();
    else if (elements.moreOverlay.classList.contains('show')) close();
  });

  return { open, close, closeConfirm, render };
}
