import { elements } from './dom.js';

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
    press.timer = setTimeout(() => { if (!presses.has(event.pointerId)) return; clearPress(event.pointerId); suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS; navigator.vibrate?.(18); openStudentRecord(Number(card.dataset.studentId), card); }, LONG_PRESS_MS);
    presses.set(event.pointerId, press);
  });
  elements.studentGrid.addEventListener('pointermove', (event) => { const press = presses.get(event.pointerId); if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) <= MOVE_CANCEL_DISTANCE) return; clearPress(event.pointerId); suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS; });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) elements.studentGrid.addEventListener(type, (event) => clearPress(event.pointerId));
  elements.studentGrid.addEventListener('contextmenu', (event) => { const card = event.target.closest('.student-card'); if (!card || !elements.studentGrid.contains(card)) return; event.preventDefault(); openStudentRecord(Number(card.dataset.studentId), card); });
  elements.studentGrid.addEventListener('click', (event) => { const card = event.target.closest('.student-card'); if (!card || !elements.studentGrid.contains(card) || performance.now() < suppressClickUntil) return; const studentId = Number(card.dataset.studentId); if (!store.toggleCompletion(studentId)) return; showToast(card.getAttribute('aria-pressed') === 'true' ? '已取消完成' : '已标记完成'); });
  const seatPresses = new Map();
  function clearSeatPress(pointerId) { const press = seatPresses.get(pointerId); if (press) clearTimeout(press.timer); seatPresses.delete(pointerId); }
  elements.seatStage.addEventListener('pointerdown', (event) => { const card = event.target.closest('.seat-card'); if (!card) return; event.stopPropagation(); const press = { x: event.clientX, y: event.clientY, timer: null }; press.timer = setTimeout(() => { if (!seatPresses.has(event.pointerId)) return; clearSeatPress(event.pointerId); suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS; navigator.vibrate?.(18); openStudentRecord(Number(card.dataset.studentId), card); }, LONG_PRESS_MS); seatPresses.set(event.pointerId, press); });
  elements.seatStage.addEventListener('pointermove', (event) => { const press = seatPresses.get(event.pointerId); if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) <= MOVE_CANCEL_DISTANCE) return; clearSeatPress(event.pointerId); suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS; });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) elements.seatStage.addEventListener(type, (event) => clearSeatPress(event.pointerId));
  elements.seatStage.addEventListener('click', (event) => { const card = event.target.closest('.seat-card'); if (!card || performance.now() < suppressClickUntil) return; const studentId = Number(card.dataset.studentId); const wasCompleted = card.getAttribute('aria-pressed') === 'true'; if (!store.toggleCompletion(studentId)) return; showToast(wasCompleted ? '已取消完成' : '已标记完成'); });
  elements.seatStage.addEventListener('contextmenu', (event) => { const card = event.target.closest('.seat-card'); if (!card) return; event.preventDefault(); openStudentRecord(Number(card.dataset.studentId), card); });
}
