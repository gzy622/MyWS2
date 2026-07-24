import { elements } from './dom.js';
import { state, setFontSizePopoverOpen, setStudentFontSize } from './state.js';

const STORAGE_KEY = 'teacher-workbench.student-name-font-size';
const REGISTER_PAGE_INDEX = 1;
const GRID_SUBVIEW_INDEX = 0;

function isStudentGridActive() {
  return state.currentPage === REGISTER_PAGE_INDEX && state.subviews[REGISTER_PAGE_INDEX] === GRID_SUBVIEW_INDEX;
}

function renderStudentFontSize() {
  const size = state.studentFontSize;
  elements.studentGrid.style.setProperty('--student-name-size', `${size}px`);
  elements.studentFontSizeInput.value = String(size);
  elements.studentFontSizeValue.value = `${size}px`;
}

function renderPopover() {
  const isGridActive = isStudentGridActive();
  const isOpen = isGridActive && state.fontSizePopoverOpen;
  elements.fontSizePopover.classList.toggle('show', isOpen);
  elements.fontSizePopover.setAttribute('aria-hidden', String(!isOpen));
  elements.moreButton.setAttribute('aria-label', '更多功能');
  if (!elements.moreOverlay.classList.contains('show')) {
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
  if (!isStudentGridActive()) return false;
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

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.fontSizePopoverOpen) closePopover();
  });

  return { open: openPopover, close: closePopover };
}
