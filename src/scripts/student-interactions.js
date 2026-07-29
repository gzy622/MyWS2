import { elements } from './dom.js';
import { haptic, Haptic } from './haptics.js';
import { logGestureDebug, logLogicDebug } from './sheet-debug.js';

const MOVE_CANCEL_DISTANCE = 9;
const LONG_PRESS_MS = 480;
const CLICK_SUPPRESSION_MS = 250;

export function initStudentInteractions({ store, showToast, openStudentRecord }) {
  const presses = new Map();
  let suppressClickUntil = 0;
  function clearPress(pointerId) { const press = presses.get(pointerId); if (press) clearTimeout(press.timer); presses.delete(pointerId); }
  elements.studentGrid.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.student-card'); if (!card || !elements.studentGrid.contains(card)) return;
    const press = { x: event.clientX, y: event.clientY, card, timer: null };
    press.timer = setTimeout(() => {
      if (!presses.has(event.pointerId)) return;
      const studentId = Number(card.dataset.studentId);
      clearPress(event.pointerId);
      suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
      logLogicDebug('student record opened', {
        source: 'grid-long-press',
        assignmentId: store.getCurrentAssignment().id,
        studentId
      });
      haptic(Haptic.medium);
      openStudentRecord(studentId, card);
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
  elements.studentGrid.addEventListener('contextmenu', (event) => {
    const card = event.target.closest('.student-card');
    if (!card || !elements.studentGrid.contains(card)) return;
    const studentId = Number(card.dataset.studentId);
    event.preventDefault();
    logLogicDebug('student record opened', {
      source: 'grid-context-menu',
      assignmentId: store.getCurrentAssignment().id,
      studentId
    });
    openStudentRecord(studentId, card);
  });
  elements.studentGrid.addEventListener('click', (event) => {
    const card = event.target.closest('.student-card');
    if (!card || !elements.studentGrid.contains(card) || performance.now() < suppressClickUntil) return;
    const studentId = Number(card.dataset.studentId);
    const wasCompleted = card.getAttribute('aria-pressed') === 'true';
    if (!store.toggleCompletion(studentId)) return;
    logLogicDebug('completion toggled', {
      source: 'grid-tap',
      assignmentId: store.getCurrentAssignment().id,
      studentId,
      fromCompleted: wasCompleted,
      toCompleted: !wasCompleted
    });
    haptic(Haptic.light);
    showToast(wasCompleted ? '已取消完成' : '已标记完成');
  });
}
