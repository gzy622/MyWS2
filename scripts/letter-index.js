import { elements } from './dom.js';
import { state } from './state.js';
import { haptic, Haptic } from './haptics.js';
import { getNameInitial, listAlphabetLetters } from './name-initial.js';

const CLEAR_HIGHLIGHT_MS = 400;
const LETTERS = listAlphabetLetters();

let pageDragging = false;
let activeLetter = null;
let activePointerId = null;
let clearTimer = 0;
/** @type {Map<string, number[]>} */
let letterToStudentIds = new Map();
/** @type {Set<string>} */
let presentLetters = new Set();
/** @type {HTMLElement | null} */
let badge = null;
/** @type {HTMLElement[]} */
let rails = [];

function ensureBadge() {
  if (badge) return badge;
  badge = document.createElement('div');
  badge.className = 'letter-index-badge';
  badge.setAttribute('aria-hidden', 'true');
  // Mount on #app so the tip is not clipped by .page overflow / page transform.
  elements.app.appendChild(badge);
  return badge;
}

function buildRail(rail) {
  rail.replaceChildren(...LETTERS.map((letter) => {
    const item = document.createElement('span');
    item.className = 'letter-index-item';
    item.dataset.letter = letter;
    item.textContent = letter;
    return item;
  }));
}

function refreshPresentLetters(students) {
  letterToStudentIds = new Map();
  presentLetters = new Set();
  for (const student of students) {
    const initial = getNameInitial(student.name);
    if (initial === '#') continue;
    presentLetters.add(initial);
    const list = letterToStudentIds.get(initial);
    if (list) list.push(student.id);
    else letterToStudentIds.set(initial, [student.id]);
  }
  for (const rail of rails) {
    rail.querySelectorAll('.letter-index-item').forEach((item) => {
      const letter = item.dataset.letter;
      const has = presentLetters.has(letter);
      item.classList.toggle('is-empty', !has);
    });
  }
}

function applyVisibility() {
  const visible = !pageDragging && state.currentPage === 1;
  for (const rail of rails) {
    rail.classList.toggle('is-visible', visible);
    rail.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
  if (!visible) {
    abortTracking({ immediate: true });
  }
}

export function setLetterIndexPageDragging(dragging) {
  pageDragging = Boolean(dragging);
  applyVisibility();
}

export function syncLetterIndexPageVisibility() {
  pageDragging = false;
  applyVisibility();
}

function clearHighlights() {
  elements.studentGrid.querySelectorAll('.student-card.is-letter-hit').forEach((card) => {
    card.classList.remove('is-letter-hit');
  });
  elements.seatGrid.querySelectorAll('.seat-card.is-letter-hit').forEach((card) => {
    card.classList.remove('is-letter-hit');
  });
}

function setRailActiveLetter(letter) {
  for (const rail of rails) {
    rail.querySelectorAll('.letter-index-item.is-active').forEach((item) => {
      item.classList.remove('is-active');
    });
    if (letter) {
      const item = rail.querySelector(`.letter-index-item[data-letter="${letter}"]`);
      item?.classList.add('is-active');
    }
  }
}

function showBadge(letter) {
  const el = ensureBadge();
  el.textContent = letter || '';
  el.classList.toggle('is-shown', Boolean(letter));
}

function highlightLetter(letter) {
  clearHighlights();
  if (!letter || !presentLetters.has(letter)) return;
  const ids = new Set(letterToStudentIds.get(letter) || []);
  elements.studentGrid.querySelectorAll('.student-card').forEach((card) => {
    if (ids.has(Number(card.dataset.studentId))) card.classList.add('is-letter-hit');
  });
  elements.seatGrid.querySelectorAll('.seat-card').forEach((card) => {
    if (ids.has(Number(card.dataset.studentId))) card.classList.add('is-letter-hit');
  });
}

function selectLetter(letter, { vibrate } = { vibrate: true }) {
  if (!letter || letter === activeLetter) return;
  activeLetter = letter;
  setRailActiveLetter(letter);
  showBadge(letter);
  highlightLetter(letter);
  if (vibrate) haptic(Haptic.light);
}

function letterFromPoint(rail, clientY) {
  const items = rail.querySelectorAll('.letter-index-item');
  if (!items.length) return null;
  const rect = rail.getBoundingClientRect();
  if (rect.height <= 0) return null;
  const ratio = (clientY - rect.top) / rect.height;
  const index = Math.max(0, Math.min(items.length - 1, Math.floor(ratio * items.length)));
  return items[index].dataset.letter || null;
}

function abortTracking({ immediate = false } = {}) {
  if (clearTimer) {
    window.clearTimeout(clearTimer);
    clearTimer = 0;
  }
  activePointerId = null;
  const letter = activeLetter;
  activeLetter = null;
  setRailActiveLetter(null);
  if (immediate) {
    showBadge(null);
    clearHighlights();
    return;
  }
  // Keep the letter tip visible after a tap/release (same window as highlights).
  if (letter) showBadge(letter);
  clearTimer = window.setTimeout(() => {
    clearTimer = 0;
    showBadge(null);
    clearHighlights();
  }, CLEAR_HIGHLIGHT_MS);
}

function endTracking(event) {
  if (activePointerId == null || (event.pointerId != null && event.pointerId !== activePointerId)) return;
  const rail = event.currentTarget;
  try {
    if (rail?.hasPointerCapture?.(event.pointerId)) rail.releasePointerCapture(event.pointerId);
  } catch { /* ignore */ }
  abortTracking({ immediate: false });
}

function bindRail(rail) {
  rail.addEventListener('pointerdown', (event) => {
    if (pageDragging || state.currentPage !== 1) return;
    if (state.activeOverlay || state.drawerOpen || state.fontSizePopoverOpen) return;
    if (event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (clearTimer) {
      window.clearTimeout(clearTimer);
      clearTimer = 0;
    }
    const letter = letterFromPoint(rail, event.clientY);
    activePointerId = event.pointerId;
    activeLetter = null;
    selectLetter(letter, { vibrate: true });
    try { rail.setPointerCapture?.(event.pointerId); } catch { /* capture may be unavailable */ }
  });

  rail.addEventListener('pointermove', (event) => {
    if (activePointerId == null || event.pointerId !== activePointerId) return;
    event.preventDefault();
    const letter = letterFromPoint(rail, event.clientY);
    selectLetter(letter, { vibrate: true });
  });

  // Prefer up/cancel only: lostpointercapture can fire around setPointerCapture and hide the tip too early.
  for (const type of ['pointerup', 'pointercancel']) {
    rail.addEventListener(type, endTracking);
  }
}

export function initLetterIndex(store) {
  rails = [elements.gridLetterIndex, elements.seatLetterIndex];
  for (const rail of rails) {
    buildRail(rail);
    bindRail(rail);
  }
  ensureBadge();
  refreshPresentLetters(store.getSnapshot().students);
  applyVisibility();
  return {
    unsubscribe: store.subscribe((snapshot) => {
      refreshPresentLetters(snapshot.students);
      if (activeLetter) highlightLetter(activeLetter);
    })
  };
}
