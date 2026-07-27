import { elements } from './dom.js';
import { state, setFontSizePopoverOpen, setStudentFontSize } from './state.js';

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
  elements.fontSizePopover.setAttribute('aria-hidden', String(!isOpen));
  elements.moreButton.setAttribute('aria-label', '更多功能');
  if (!elements.moreMenu.classList.contains('show')) {
    elements.moreButton.setAttribute('aria-expanded', String(isOpen));
  }
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

function closePopoverFromOutside(event) {
  if (!state.fontSizePopoverOpen) return;
  if (elements.fontSizePopover.contains(event.target) || elements.moreButton.contains(event.target)) return;
  closePopover();
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

  document.addEventListener('pointerdown', closePopoverFromOutside);
  document.addEventListener('click', closePopoverFromOutside);

  return { open: openPopover, close: closePopover };
}
