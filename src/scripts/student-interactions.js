import { elements } from './dom.js';
import { isQuickScoreActive } from './state.js';
import { haptic, Haptic } from './haptics.js';
import { logGestureDebug, logLogicDebug } from './sheet-debug.js';

const MOVE_CANCEL_DISTANCE = 9;
const LONG_PRESS_MS = 480;
const CLICK_SUPPRESSION_MS = 450;

export function initStudentInteractions({ store, showToast, openStudentRecord }) {
  const presses = new Map();
  const longPressedPointers = new Map();
  let suppressedClickCard = null;
  let suppressClickUntil = 0;

  function clearPress(pointerId) {
    const press = presses.get(pointerId);
    if (press) {
      clearTimeout(press.timer);
      press.card.classList.remove('is-pressing');
    }
    presses.delete(pointerId);
  }

  function suppressLongPressClick(card) {
    suppressedClickCard = card;
    suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
  }

  function shouldSuppressClick(card) {
    if (card !== suppressedClickCard) return false;
    const suppress = performance.now() < suppressClickUntil;
    suppressedClickCard = null;
    return suppress;
  }

  function toggleCompletion(studentId, card, source) {
    const wasCompleted = card.getAttribute('aria-pressed') === 'true';
    if (!store.toggleCompletion(studentId)) return;
    logLogicDebug('completion toggled', {
      source,
      assignmentId: store.getCurrentAssignment().id,
      studentId,
      fromCompleted: wasCompleted,
      toCompleted: !wasCompleted
    });
    haptic(Haptic.light);
    showToast(wasCompleted ? '已取消完成' : '已标记完成');
  }

  function openRecord(studentId, card, source, { feedback = false } = {}) {
    logLogicDebug('student record opened', {
      source,
      assignmentId: store.getCurrentAssignment().id,
      studentId
    });
    if (feedback) haptic(Haptic.medium);
    openStudentRecord(studentId, card);
  }

  elements.studentGrid.addEventListener('pointerdown', (event) => {
    // A new contact cannot belong to the long-press sequence whose click is pending.
    suppressedClickCard = null;
    const card = event.target.closest('.student-card'); if (!card || !elements.studentGrid.contains(card)) return;
    card.classList.add('is-pressing');
    const press = { x: event.clientX, y: event.clientY, card, timer: null };
    press.timer = setTimeout(() => {
      if (!presses.has(event.pointerId)) return;
      const studentId = Number(card.dataset.studentId);
      clearPress(event.pointerId);
      // Opening the Sheet can retarget the eventual pointerup away from the grid.
      // Keep ownership globally until that physical pointer sequence actually ends.
      longPressedPointers.set(event.pointerId, card);
      if (isQuickScoreActive()) {
        toggleCompletion(studentId, card, 'grid-long-press');
      } else {
        openRecord(studentId, card, 'grid-long-press', { feedback: true });
      }
    }, LONG_PRESS_MS);
    presses.set(event.pointerId, press);
  });
  elements.studentGrid.addEventListener('pointermove', (event) => {
    const press = presses.get(event.pointerId);
    const travel = press ? Math.hypot(event.clientX - press.x, event.clientY - press.y) : 0;
    if (!press || travel <= MOVE_CANCEL_DISTANCE) return;
    clearPress(event.pointerId);
    logGestureDebug('long press cancelled', {
      target: 'student-grid',
      studentId: Number(press.card.dataset.studentId),
      travel: Math.round(travel),
      threshold: MOVE_CANCEL_DISTANCE
    });
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) elements.studentGrid.addEventListener(type, (event) => clearPress(event.pointerId));
  window.addEventListener('pointerup', (event) => {
    const card = longPressedPointers.get(event.pointerId);
    if (!card) return;
    longPressedPointers.delete(event.pointerId);
    // Start the bounded guard from release, immediately before the browser may
    // synthesize click, rather than from the earlier long-press timeout.
    suppressLongPressClick(card);
  }, true);
  window.addEventListener('pointercancel', (event) => {
    longPressedPointers.delete(event.pointerId);
  }, true);
  elements.studentGrid.addEventListener('contextmenu', (event) => {
    const card = event.target.closest('.student-card');
    if (!card || !elements.studentGrid.contains(card)) return;
    const studentId = Number(card.dataset.studentId);
    event.preventDefault();
    if (isQuickScoreActive()) toggleCompletion(studentId, card, 'grid-context-menu');
    else openRecord(studentId, card, 'grid-context-menu');
  });
  elements.studentGrid.addEventListener('click', (event) => {
    const card = event.target.closest('.student-card');
    if (!card || !elements.studentGrid.contains(card) || shouldSuppressClick(card)) return;
    const studentId = Number(card.dataset.studentId);
    if (isQuickScoreActive()) {
      openRecord(studentId, card, 'grid-tap', { feedback: true });
      return;
    }
    toggleCompletion(studentId, card, 'grid-tap');
  });
}
