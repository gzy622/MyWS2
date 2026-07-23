import { elements } from './dom.js';

const MOVE_CANCEL_DISTANCE = 9;
const CLICK_SUPPRESSION_MS = 250;

export function initStudentInteractions({ store, showToast }) {
  const presses = new Map();
  let suppressClickUntil = 0;

  function clearPress(pointerId) {
    presses.delete(pointerId);
  }

  elements.studentGrid.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.student-card');
    if (!card || !elements.studentGrid.contains(card)) return;
    presses.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });

  elements.studentGrid.addEventListener('pointermove', (event) => {
    const press = presses.get(event.pointerId);
    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) <= MOVE_CANCEL_DISTANCE) return;
    clearPress(event.pointerId);
    suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
  });

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) {
    elements.studentGrid.addEventListener(type, (event) => clearPress(event.pointerId));
  }

  elements.studentGrid.addEventListener('click', (event) => {
    const card = event.target.closest('.student-card');
    if (!card || !elements.studentGrid.contains(card) || performance.now() < suppressClickUntil) return;
    const studentId = Number(card.dataset.studentId);
    if (!store.toggleCompletion(studentId)) return;
    showToast(card.getAttribute('aria-pressed') === 'true' ? '已取消完成' : '已标记完成');
  });
}
