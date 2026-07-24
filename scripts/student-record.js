import { elements } from './dom.js';
import { setActiveOverlay } from './state.js';

const SHEET_CLOSE_DISTANCE = 88;

export function initStudentRecord({ store, showToast, viewport, closeOthers }) {
  let studentId = null;
  let trigger = null;
  let dragging = false;
  let pointerId;
  let dragStartY = 0;
  let dragOffsetY = 0;

  function resetPanelDrag() {
    dragging = false;
    dragOffsetY = 0;
    elements.studentRecordPanel.classList.remove('dragging');
    elements.studentRecordPanel.style.transform = '';
  }

  function close() {
    if (!elements.studentRecordOverlay.classList.contains('show')) return;
    const triggerSelector = trigger?.classList.contains('seat-card') ? '.seat-card' : '.student-card';
    const restoreTarget = trigger?.isConnected
      ? trigger
      : elements.app.querySelector(`${triggerSelector}[data-student-id="${studentId}"]`);
    resetPanelDrag();
    elements.studentRecordOverlay.classList.remove('show');
    elements.studentRecordOverlay.setAttribute('aria-hidden', 'true');
    elements.studentRecordOverlay.inert = true;
    setActiveOverlay(null);
    viewport.unlockStudentGrid();
    restoreTarget?.focus({ preventScroll: true });
    trigger = null;
  }

  function updateScoreDraft(key) {
    const current = elements.studentScoreInput.value;
    if (key === 'backspace') {
      elements.studentScoreInput.value = current.slice(0, -1);
    } else if (key === '.') {
      if (!current.includes('.') && current !== '100') elements.studentScoreInput.value = current ? `${current}.` : '0.';
    } else if (/^\d$/.test(key)) {
      const next = current === '0' ? key : `${current}${key}`;
      const fraction = next.split('.')[1];
      if ((!fraction || fraction.length <= 1) && Number(next) <= 100) elements.studentScoreInput.value = next;
    }
    elements.studentScoreError.textContent = '';
  }

  function open(nextStudentId, source) {
    const state = store.getSnapshot();
    const student = state.students.find(({ id }) => id === nextStudentId);
    if (!student) return;
    closeOthers?.('student-record');
    viewport.lockStudentGrid();
    resetPanelDrag();
    studentId = nextStudentId; trigger = source;
    elements.studentRecordTitle.textContent = student.name;
    const score = store.getScore(studentId);
    const completed = store.getCompletedStudentIds().has(studentId);
    elements.studentRecordStatus.textContent = score !== undefined ? `已计分 · ${score} 分` : (completed ? '已提交 · 尚未计分' : '未提交');
    elements.studentScoreInput.value = score === undefined ? '' : String(score);
    elements.studentScoreError.textContent = '';
    setActiveOverlay('student-record');
    elements.studentRecordOverlay.classList.add('show'); elements.studentRecordOverlay.setAttribute('aria-hidden', 'false');
    elements.studentRecordOverlay.inert = false;
    elements.studentScoreInput.focus({ preventScroll: true });
  }

  elements.closeStudentRecordButton.addEventListener('click', close);
  elements.studentRecordOverlay.addEventListener('click', (event) => { if (event.target === elements.studentRecordOverlay) close(); });
  elements.studentRecordHandle.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    dragging = true;
    pointerId = event.pointerId;
    dragStartY = event.clientY;
    dragOffsetY = 0;
    elements.studentRecordPanel.classList.add('dragging');
    elements.studentRecordHandle.setPointerCapture?.(pointerId);
  });
  elements.studentRecordHandle.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragOffsetY = Math.max(0, event.clientY - dragStartY);
    elements.studentRecordPanel.style.transform = `translateY(${dragOffsetY}px)`;
    event.preventDefault();
  }, { passive: false });
  const endPanelDrag = (event, cancelled = false) => {
    if (!dragging || (event.pointerId != null && event.pointerId !== pointerId)) return;
    const shouldClose = !cancelled && dragOffsetY > SHEET_CLOSE_DISTANCE;
    dragging = false;
    elements.studentRecordPanel.classList.remove('dragging');
    if (shouldClose) close();
    else elements.studentRecordPanel.style.transform = '';
    if (elements.studentRecordHandle.hasPointerCapture?.(pointerId)) elements.studentRecordHandle.releasePointerCapture(pointerId);
  };
  elements.studentRecordHandle.addEventListener('pointerup', (event) => endPanelDrag(event));
  elements.studentRecordHandle.addEventListener('pointercancel', (event) => endPanelDrag(event, true));
  elements.studentRecordHandle.addEventListener('lostpointercapture', (event) => {
    if (event.target === elements.studentRecordHandle) endPanelDrag(event, true);
  });
  elements.studentScoreControls.addEventListener('click', (event) => { const key = event.target.closest('[data-score-key]')?.dataset.scoreKey; if (key) updateScoreDraft(key); });
  elements.clearStudentRecordButton.addEventListener('click', () => { if (store.clearStudentRecord(studentId)) showToast('已清除记录'); close(); });
  elements.saveStudentRecordButton.addEventListener('click', () => { const result = store.setScore(studentId, elements.studentScoreInput.value); if (result === 'invalid') { elements.studentScoreError.textContent = '请输入 0–100 的分数，最多一位小数'; elements.studentScoreInput.focus(); return; } showToast('分数已保存'); close(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && studentId !== null && elements.studentRecordOverlay.classList.contains('show')) close(); });
  return { open, close };
}
