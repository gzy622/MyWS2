import { elements } from './dom.js';
import { closeDrawer, openDrawer } from './drawer.js';
import { setSub, syncQuickScoreModeHint } from './navigation.js';
import { state, setActiveOverlay, setQuickScoreMode } from './state.js';
import { haptic, Haptic } from './haptics.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently, syncChromeInert } from './focus.js';

const ARRANGE_PAGE_INDEX = 0;
const REGISTER_PAGE_INDEX = 1;
const STATS_PAGE_INDEX = 2;
const GRID_SUBVIEW_INDEX = 0;
const SEAT_SUBVIEW_INDEX = 1;
const PEOPLE_SUBVIEW_INDEX = 0;
const SCHEDULE_SUBVIEW_INDEX = 1;
const GRADES_SUBVIEW_INDEX = 1;

const REGISTER_ACTIONS = new Set(['register-view', 'create-assignment', 'clear-assignment', 'quick-score', 'font-size', 'seat-edit']);
const PEOPLE_ACTIONS = new Set(['add-role', 'add-duty', 'clear-roles', 'clear-duties']);
const SCHEDULE_ACTIONS = new Set(['clear-schedule', 'highlight-subjects']);
const GRADES_ACTIONS = new Set(['add-subject', 'add-exam', 'grade-stats', 'clear-grades']);
const GLOBAL_ACTIONS = new Set(['toggle-theme', 'open-settings']);

export function initMoreSheet({ store, showToast, seatCanvas, fontSize, theme, closeOthers, highlightSubjects, openCreateAssignment, openCreateExam, openGradeStats, onQuickScoreChange }) {
  let trigger = null;
  let confirmAction = null;
  let confirmReturnFocus = null;
  let confirmSheet;
  let moreSheet;
  let restoreMoreFocus = true;

  function close({ restoreFocus = true } = {}) {
    if (!moreSheet?.isPresented() && !elements.moreMenu.classList.contains('show')) return;
    restoreMoreFocus = restoreFocus;
    moreSheet?.closeInstant();
  }

  function closeConfirm({ restoreFocus = true } = {}) {
    if (!confirmSheet?.isPresented() && !elements.confirmSheet.classList.contains('show')) return;
    if (!restoreFocus) confirmReturnFocus = null;
    if (confirmSheet?.isPresented()) confirmSheet.closeInstant();
    else {
      elements.confirmSheet.classList.remove('show');
      elements.confirmSheet.setAttribute('aria-hidden', 'true');
      elements.confirmSheet.inert = true;
      setActiveOverlay(state.rosterEditorOpen ? 'roster-editor' : null);
      syncChromeInert();
      const focus = confirmReturnFocus;
      confirmAction = null;
      confirmReturnFocus = null;
      if (restoreFocus && focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  const confirmPanel = elements.confirmSheet.querySelector('.confirm-panel');

  confirmSheet = createSheetController({
    id: 'confirm',
    layer: elements.confirmSheet,
    panel: confirmPanel,
    direction: 'from-bottom',
    scrollPorts: [confirmPanel],
    isOpen: () => elements.confirmSheet.classList.contains('show') && !confirmSheet?.isActive(),
    onRequestClose: closeConfirm,
    onPrepare() {
      setActiveOverlay('confirm');
      elements.confirmSheet.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('confirm');
      elements.confirmSheet.setAttribute('aria-hidden', 'false');
      elements.confirmSheet.inert = false;
    },
    onClosed() {
      elements.confirmSheet.setAttribute('aria-hidden', 'true');
      setActiveOverlay(state.rosterEditorOpen ? 'roster-editor' : null);
      confirmAction = null;
      const focus = confirmReturnFocus;
      confirmReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  function confirm({ title, message, action, returnFocus, preserveDrawer = false }) {
    close({ restoreFocus: false });
    if (!preserveDrawer) closeDrawer({ restoreFocus: false });
    closeOthers?.(preserveDrawer ? ['confirm', 'drawer'] : 'confirm');
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    confirmAction = action;
    confirmReturnFocus = returnFocus;
    confirmSheet.openInstant();
    focusSilently(elements.cancelConfirmButton);
  }

  function render() {
    const onRegister = state.currentPage === REGISTER_PAGE_INDEX;
    const onArrange = state.currentPage === ARRANGE_PAGE_INDEX;
    const onStats = state.currentPage === STATS_PAGE_INDEX;
    const isGrid = state.subviews[REGISTER_PAGE_INDEX] === GRID_SUBVIEW_INDEX;
    const isSeats = state.subviews[REGISTER_PAGE_INDEX] === SEAT_SUBVIEW_INDEX;
    const isPeople = state.subviews[ARRANGE_PAGE_INDEX] === PEOPLE_SUBVIEW_INDEX;
    const isSchedule = state.subviews[ARRANGE_PAGE_INDEX] === SCHEDULE_SUBVIEW_INDEX;
    const isGrades = state.subviews[STATS_PAGE_INDEX] === GRADES_SUBVIEW_INDEX;
    const isDark = theme?.get() === 'dark';
    const themeButton = elements.moreMenu.querySelector('[data-more-action="toggle-theme"]');
    const themeValue = themeButton?.querySelector('[data-more-theme-value]');
    themeButton?.setAttribute('aria-pressed', String(isDark));
    themeButton?.setAttribute('aria-label', isDark ? '切换到浅色模式' : '切换到深色模式');
    if (themeValue) themeValue.textContent = isDark ? '深色' : '浅色';
    for (const button of elements.moreActions) {
      const action = button.dataset.moreAction;
      let hidden = false;
      if (GLOBAL_ACTIONS.has(action)) {
        hidden = false;
      } else if (REGISTER_ACTIONS.has(action)) {
        hidden = !onRegister
          || (action === 'seat-edit' && !isSeats);
      } else if (PEOPLE_ACTIONS.has(action)) {
        hidden = !onArrange || !isPeople;
      } else if (SCHEDULE_ACTIONS.has(action)) {
        hidden = !onArrange || !isSchedule;
      } else if (GRADES_ACTIONS.has(action)) {
        hidden = !onStats || !isGrades;
      } else {
        hidden = true;
      }
      button.hidden = hidden;
      if (action === 'register-view') {
        button.textContent = isGrid ? '切换至座位视图' : '切换回网格视图';
      }
      if (action === 'quick-score') {
        button.setAttribute('aria-pressed', String(state.quickScoreMode));
      }
      if (action === 'seat-edit') {
        button.setAttribute('aria-pressed', String(state.seatEditing));
        button.textContent = state.seatEditing ? '退出编辑模式' : '编辑座位表';
      }
    }
    for (const group of elements.moreMenu.querySelectorAll('[data-more-group]')) {
      group.hidden = !group.querySelector('[data-more-action]:not([hidden])');
    }
  }

  moreSheet = createSheetController({
    id: 'more',
    layer: elements.moreMenu,
    panel: elements.moreMenuPanel,
    direction: 'from-bottom',
    scrollPorts: [elements.moreMenuPanel],
    isOpen: () => elements.moreMenu.classList.contains('show') && !moreSheet?.isActive(),
    onRequestClose: close,
    onPrepare({ source } = {}) {
      if (source === 'gesture') {
        closeOthers?.('more');
        closeDrawer({ restoreFocus: false });
        fontSize.close();
        trigger = null;
        restoreMoreFocus = false;
        render();
      }
      setActiveOverlay('more');
      elements.moreMenu.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('more');
      elements.moreMenu.setAttribute('aria-hidden', 'false');
      elements.moreMenu.inert = false;
      elements.moreButton.setAttribute('aria-expanded', 'true');
      syncChromeInert();
    },
    onClosed() {
      elements.moreMenu.setAttribute('aria-hidden', 'true');
      elements.moreButton.setAttribute('aria-expanded', 'false');
      if (state.activeOverlay === 'more') setActiveOverlay(null);
      syncChromeInert();
      if (restoreMoreFocus) focusSilently(trigger);
      trigger = null;
      restoreMoreFocus = true;
    }
  });

  function open() {
    if (moreSheet.isPresented() || elements.moreMenu.classList.contains('show')) {
      close();
      return;
    }
    closeOthers?.('more');
    closeDrawer({ restoreFocus: false });
    fontSize.close();
    trigger = elements.moreButton;
    render();
    restoreMoreFocus = true;
    moreSheet.openInstant();
    const firstAction = [...elements.moreActions].find((button) => !button.hidden);
    focusSilently(firstAction);
  }

  elements.moreButton.addEventListener('click', open);
  elements.closeMoreMenuButton.addEventListener('click', () => close());
  elements.moreActions.forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const action = button.dataset.moreAction;
    if (action === 'toggle-theme') {
      const nextTheme = theme?.toggle();
      render();
      showToast(nextTheme === 'dark' ? '已切换到深色模式' : '已切换到浅色模式');
      return;
    }
    if (action === 'open-settings') {
      close({ restoreFocus: false });
      openDrawer({ returnFocus: elements.moreButton });
      return;
    }
    if (action === 'register-view') {
      const targetSubview = state.subviews[REGISTER_PAGE_INDEX] === GRID_SUBVIEW_INDEX
        ? SEAT_SUBVIEW_INDEX
        : GRID_SUBVIEW_INDEX;
      close({ restoreFocus: false });
      setSub(REGISTER_PAGE_INDEX, targetSubview);
      focusSilently(elements.moreButton);
      return;
    }
    if (action === 'create-assignment') {
      close({ restoreFocus: false });
      openCreateAssignment?.({ returnFocus: elements.moreButton });
      return;
    }
    if (action === 'clear-assignment') {
      const assignmentName = store.getCurrentAssignment()?.name ?? '当前作业';
      confirm({
        title: '清除当前作业',
        message: `将清除「${assignmentName}」的全部完成状态和分数。`,
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
    if (action === 'quick-score') {
      setQuickScoreMode(!state.quickScoreMode);
      onQuickScoreChange?.();
      syncQuickScoreModeHint();
      render();
      close();
      showToast(state.quickScoreMode ? '已进入快速打分' : '已退出快速打分');
      return;
    }
    if (action === 'seat-edit') {
      seatCanvas.setEditing(!state.seatEditing);
      close();
      showToast(state.seatEditing ? '已进入座位编辑模式' : '已退出座位编辑模式');
      return;
    }
    if (action === 'add-role') {
      close();
      const role = store.addRole();
      showToast(role ? `已新增「${role.title}」` : '无法新增班干');
      return;
    }
    if (action === 'add-duty') {
      close();
      const duty = store.addDuty();
      showToast(duty ? `已新增「${duty.title}」` : '无法新增值日');
      return;
    }
    if (action === 'clear-roles') {
      confirm({
        title: '清空班干指派',
        message: '将清除所有职位上的学生，职位本身保留。',
        action: () => showToast(store.clearAllRoleAssignments() ? '已清空班干指派' : '当前没有班干指派'),
        returnFocus: elements.moreButton
      });
      return;
    }
    if (action === 'clear-duties') {
      confirm({
        title: '清空值日安排',
        message: '将清除所有值日上的学生，值日项本身保留。',
        action: () => showToast(store.clearAllDutyAssignments() ? '已清空值日安排' : '当前没有值日安排'),
        returnFocus: elements.moreButton
      });
      return;
    }
    if (action === 'clear-schedule') {
      confirm({
        title: '清空本周课表',
        message: '将清除全部课表格内容，节次名称保留。',
        action: () => showToast(store.clearAllScheduleSlots() ? '已清空本周课表' : '当前课表为空'),
        returnFocus: elements.moreButton
      });
      return;
    }
    if (action === 'highlight-subjects') {
      close({ restoreFocus: false });
      highlightSubjects?.open({ returnFocus: elements.moreButton });
      return;
    }
    if (action === 'add-subject') {
      close();
      const subject = store.addSubject();
      showToast(subject ? `已新增「${subject.title}」` : '无法新增科目');
      return;
    }
    if (action === 'add-exam') {
      close({ restoreFocus: false });
      openCreateExam?.({ returnFocus: elements.moreButton });
      return;
    }
    if (action === 'grade-stats') {
      close({ restoreFocus: false });
      openGradeStats?.({ returnFocus: elements.moreButton });
      return;
    }
    if (action === 'clear-grades') {
      const snapshot = store.getSnapshot();
      const examId = state.gradeExamId != null
        && snapshot.exams.some((exam) => exam.id === state.gradeExamId)
        ? state.gradeExamId
        : snapshot.exams[0]?.id;
      const examName = snapshot.exams.find((exam) => exam.id === examId)?.title ?? '当前考试';
      confirm({
        title: '清空本场成绩',
        message: `将清除「${examName}」的全部成绩，科目与其他考试保留。`,
        action: () => {
          if (examId == null) {
            showToast('当前没有考试');
            return;
          }
          showToast(store.clearExamGrades(examId) ? '已清空本场成绩' : '当前没有成绩');
        },
        returnFocus: elements.moreButton
      });
    }
  }));
  elements.cancelConfirmButton.addEventListener('click', () => closeConfirm());
  elements.acceptConfirmButton.addEventListener('click', () => {
    const action = confirmAction;
    const returnFocus = confirmReturnFocus;
    closeConfirm({ restoreFocus: false });
    haptic(Haptic.medium);
    action?.();
    if (returnFocus) focusSilently(returnFocus);
  });

  return { open, close, closeConfirm, confirm, render, confirmSheet, moreSheet };
}
