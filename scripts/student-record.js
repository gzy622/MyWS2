import { elements } from './dom.js';
import { setActiveOverlay } from './state.js';
import { haptic, Haptic } from './haptics.js';
import { bindSheetHandleDrag } from './sheet-drag.js';

export function initStudentRecord({ store, showToast, viewport, closeOthers }) {
  let studentId = null;
  let trigger = null;
  let handleDrag;

  function close() {
    if (!elements.studentRecordSheet.classList.contains('show')) return;
    const triggerSelector = trigger?.classList.contains('seat-card') ? '.seat-card' : '.student-card';
    const restoreTarget = trigger?.isConnected
      ? trigger
      : elements.app.querySelector(`${triggerSelector}[data-student-id="${studentId}"]`);
    handleDrag?.reset();
    elements.studentRecordSheet.classList.remove('show');
    elements.studentRecordSheet.setAttribute('aria-hidden', 'true');
    elements.studentRecordSheet.inert = true;
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
    handleDrag?.reset();
    studentId = nextStudentId; trigger = source;
    elements.studentRecordTitle.textContent = student.name;
    const score = store.getScore(studentId);
    const completed = store.getCompletedStudentIds().has(studentId);
    elements.studentRecordStatus.textContent = score !== undefined ? `已计分 · ${score} 分` : (completed ? '已提交 · 尚未计分' : '未提交');
    elements.studentScoreInput.value = score === undefined ? '' : String(score);
    elements.studentScoreError.textContent = '';
    setActiveOverlay('student-record');
    elements.studentRecordSheet.classList.add('show'); elements.studentRecordSheet.setAttribute('aria-hidden', 'false');
    elements.studentRecordSheet.inert = false;
    elements.studentScoreInput.focus({ preventScroll: true });
  }

  elements.closeStudentRecordButton.addEventListener('click', close);
  elements.studentRecordSheet.addEventListener('click', (event) => { if (event.target === elements.studentRecordSheet) close(); });
  handleDrag = bindSheetHandleDrag({
    handle: elements.studentRecordHandle,
    panel: elements.studentRecordPanel,
    direction: 'down',
    onClose: close,
  });
  elements.studentScoreControls.addEventListener('click', (event) => { const key = event.target.closest('[data-score-key]')?.dataset.scoreKey; if (key) updateScoreDraft(key); });
  elements.clearStudentRecordButton.addEventListener('click', () => { if (store.clearStudentRecord(studentId)) showToast('已清除记录'); close(); });
  elements.saveStudentRecordButton.addEventListener('click', () => {
    const result = store.setScore(studentId, elements.studentScoreInput.value);
    if (result === 'invalid') {
      elements.studentScoreError.textContent = '请输入 0–100 的分数，最多一位小数';
      elements.studentScoreInput.focus();
      return;
    }
    haptic(Haptic.medium);
    showToast('分数已保存');
    close();
  });
  return { open, close };
}
