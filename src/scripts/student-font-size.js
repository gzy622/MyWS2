import { elements } from './dom.js';
import { state, setFontSizePopoverOpen, setStudentFontSize } from './state.js';
import { syncChromeInert } from './focus.js';

const STORAGE_KEY = 'teacher-workbench.student-name-font-size';
const REGISTER_PAGE_INDEX = 1;
const SEAT_EDIT_FONT_SCALE = 1.25;
const SEAT_VIEW_FONT_SCALE = 1.5;

function isRegisterNameViewActive() {
  return state.currentPage === REGISTER_PAGE_INDEX;
}

function renderStudentFontSize() {
  const size = state.studentFontSize;
  elements.studentGrid.style.setProperty('--student-name-size', `${size}px`);
  elements.seatStage.style.setProperty('--seat-name-size', `${size * SEAT_EDIT_FONT_SCALE}px`);
  elements.seatStage.style.setProperty('--seat-view-name-size', `${size * SEAT_VIEW_FONT_SCALE}px`);
  elements.studentFontSizeInput.value = String(size);
  elements.studentFontSizeValue.value = `${size}px`;
}

function renderPopover() {
  const isRegisterActive = isRegisterNameViewActive();
  const isOpen = isRegisterActive && state.fontSizePopoverOpen;
  elements.fontSizePopover.classList.toggle('show', isOpen);
  elements.app.classList.toggle('is-font-popover-open', isOpen);
  elements.fontSizePopover.setAttribute('aria-hidden', String(!isOpen));
  elements.moreButton.setAttribute('aria-label', '更多功能');
  if (!elements.moreMenu.classList.contains('show')) {
    elements.moreButton.setAttribute('aria-expanded', String(isOpen));
  }
  syncChromeInert();
}

function persistStudentFontSize() {
  try {
    localStorage.setItem(STORAGE_KEY, String(state.studentFontSize));
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

function restoreStudentFontSize() {
  try {
    const storedSize = localStorage.getItem(STORAGE_KEY);
    if (storedSize !== null) setStudentFontSize(storedSize);
  } catch {
    // Keep the in-memory default when storage cannot be read.
  }
}

function closePopover() {
  setFontSizePopoverOpen(false);
  renderPopover();
}

function openPopover() {
  if (!isRegisterNameViewActive()) return false;
  setFontSizePopoverOpen(true);
  renderPopover();
  elements.studentFontSizeInput.focus({ preventScroll: true });
  return true;
}

/**
 * 浮窗打开时点外部的首次点击只关闭浮窗：
 * 浮窗打开期间 chrome 不可命中（is-font-popover-open），外部按压只落在 #app，
 * 该手势的 click 同样只落在 #app——在此关闭浮窗并吞掉 click，底层控件既收
 * 不到 pointerdown 也收不到 click，不呈现任何按压视觉。
 * 捕获层 pointerdown 只刷新“本次按压从外部开始”的标记，子节点的
 * stopPropagation 无法阻止刷新，避免滑杆等内部按压后残留误吞。
 */
let dismissArmed = false;

function onDocumentPointerDown(event) {
  dismissArmed = state.fontSizePopoverOpen
    && !elements.fontSizePopover.contains(event.target)
    && !elements.moreButton.contains(event.target);
}

function onDocumentClickCapture(event) {
  if (!dismissArmed) return;
  dismissArmed = false;
  closePopover();
  event.preventDefault();
  event.stopPropagation();
}

export function initStudentFontSize() {
  restoreStudentFontSize();
  renderStudentFontSize();
  renderPopover();

  elements.studentFontSizeInput.addEventListener('pointerdown', (event) => event.stopPropagation());
  elements.studentFontSizeInput.addEventListener('input', (event) => {
    setStudentFontSize(event.currentTarget.value);
    persistStudentFontSize();
    renderStudentFontSize();
  });

  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('click', onDocumentClickCapture, true);

  return { open: openPopover, close: closePopover };
}
