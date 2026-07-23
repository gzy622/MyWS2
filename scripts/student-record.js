import { elements } from './dom.js';
import { setActiveOverlay } from './state.js';

const QUICK_SCORES = [20, 50, 80, 100];

export function initStudentRecord({ store, showToast }) {
  let studentId = null;
  let trigger = null;
  let mode = 'completed';

  function close() {
    elements.studentRecordOverlay.classList.remove('show');
    elements.studentRecordOverlay.setAttribute('aria-hidden', 'true');
    setActiveOverlay(null);
    trigger?.focus({ preventScroll: true });
    trigger = null;
  }

  function renderMode() {
    elements.studentRecordModes.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.recordMode === mode)));
    elements.studentScoreControls.hidden = mode !== 'score';
  }

  function open(nextStudentId, source) {
    const state = store.getSnapshot();
    const student = state.students.find(({ id }) => id === nextStudentId);
    if (!student) return;
    studentId = nextStudentId; trigger = source; mode = store.getScore(studentId) === undefined ? 'completed' : 'score';
    elements.studentRecordTitle.textContent = student.name;
    const score = store.getScore(studentId);
    const completed = store.getCompletedStudentIds().has(studentId);
    elements.studentRecordStatus.textContent = score !== undefined ? `当前状态：${score} 分` : `当前状态：${completed ? '已完成' : '未记录'}`;
    elements.studentScoreInput.value = score === undefined ? '' : String(score);
    elements.studentScoreError.textContent = '';
    renderMode(); setActiveOverlay('student-record');
    elements.studentRecordOverlay.classList.add('show'); elements.studentRecordOverlay.setAttribute('aria-hidden', 'false');
    (mode === 'score' ? elements.studentScoreInput : elements.closeStudentRecordButton).focus({ preventScroll: true });
  }

  elements.closeStudentRecordButton.addEventListener('click', close);
  elements.studentRecordOverlay.addEventListener('click', (event) => { if (event.target === elements.studentRecordOverlay) close(); });
  elements.studentRecordModes.forEach((button) => button.addEventListener('click', () => { mode = button.dataset.recordMode; elements.studentScoreError.textContent = ''; renderMode(); if (mode === 'score') elements.studentScoreInput.focus(); }));
  elements.studentScoreControls.addEventListener('click', (event) => { const value = Number(event.target.dataset.score); if (QUICK_SCORES.includes(value)) elements.studentScoreInput.value = String(value); });
  elements.clearStudentRecordButton.addEventListener('click', () => { if (store.clearStudentRecord(studentId)) showToast('已清除记录'); close(); });
  elements.saveStudentRecordButton.addEventListener('click', () => { const result = mode === 'score' ? store.setScore(studentId, elements.studentScoreInput.value) : (store.markStudentCompleted(studentId) ? 'saved' : 'saved'); if (result === 'invalid') { elements.studentScoreError.textContent = '请输入 0–100 的分数，最多一位小数'; elements.studentScoreInput.focus(); return; } showToast(mode === 'score' ? '分数已保存' : '已标记完成'); close(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && studentId !== null && elements.studentRecordOverlay.classList.contains('show')) close(); });
  return { open, close };
}
