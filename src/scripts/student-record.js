import { elements } from './dom.js';
import { setActiveOverlay } from './state.js';
import { haptic, Haptic } from './haptics.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently, syncChromeInert } from './focus.js';
import { logLogicDebug } from './sheet-debug.js';

export function initStudentRecord({ store, showToast, viewport, closeOthers }) {
  let studentId = null;
  let trigger = null;
  let sheet;

  function restoreRecordFocus() {
    const triggerSelector = trigger?.classList.contains('seat-card') ? '.seat-card' : '.student-card';
    const restoreTarget = trigger?.isConnected
      ? trigger
      : elements.app.querySelector(`${triggerSelector}[data-student-id="${studentId}"]`);
    if (restoreTarget) focusSilently(restoreTarget);
    else blurIfSheetChrome();
    trigger = null;
  }

  function close() {
    if (!sheet?.isPresented() && !elements.studentRecordSheet.classList.contains('show')) return;
    if (sheet?.isPresented()) sheet.closeInstant();
    else {
      elements.studentRecordSheet.classList.remove('show');
      elements.studentRecordSheet.setAttribute('aria-hidden', 'true');
      elements.studentRecordSheet.inert = true;
      setActiveOverlay(null);
      viewport.unlockStudentGrid();
      syncChromeInert();
      restoreRecordFocus();
    }
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

  sheet = createSheetController({
    id: 'student-record',
    layer: elements.studentRecordSheet,
    panel: elements.studentRecordPanel,
    direction: 'from-bottom',
    scrollPorts: [elements.studentRecordPanel],
    isOpen: () => elements.studentRecordSheet.classList.contains('show') && !sheet?.isActive(),
    onPrepare() {
      setActiveOverlay('student-record');
      elements.studentRecordSheet.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('student-record');
      elements.studentRecordSheet.setAttribute('aria-hidden', 'false');
      elements.studentRecordSheet.inert = false;
    },
    onClosed() {
      elements.studentRecordSheet.setAttribute('aria-hidden', 'true');
      setActiveOverlay(null);
      viewport.unlockStudentGrid();
      syncChromeInert();
      restoreRecordFocus();
    }
  });

  function open(nextStudentId, source) {
    const snapshot = store.getSnapshot();
    const student = snapshot.students.find(({ id }) => id === nextStudentId);
    if (!student) return;
    closeOthers?.('student-record');
    viewport.lockStudentGrid();
    studentId = nextStudentId;
    trigger = source;
    elements.studentRecordTitle.textContent = student.name;
    const score = store.getScore(studentId);
    const completed = store.getCompletedStudentIds().has(studentId);
    logLogicDebug('student record presented', {
      assignmentId: store.getCurrentAssignment().id,
      studentId,
      source: source?.classList.contains('seat-card') ? 'seat-card' : 'student-card',
      completed,
      hasScore: score !== undefined
    });
    elements.studentRecordStatus.textContent = score !== undefined
      ? `已计分 · ${score} 分`
      : (completed ? '已提交 · 尚未计分' : '未提交');
    elements.studentScoreInput.value = score === undefined ? '' : String(score);
    elements.studentScoreError.textContent = '';
    sheet.openInstant();
    elements.studentScoreInput.focus({ preventScroll: true });
  }

  elements.closeStudentRecordButton.addEventListener('click', close);
  elements.studentRecordSheet.addEventListener('click', (event) => {
    if (event.target === elements.studentRecordSheet && !sheet.isActive()) close();
  });
  elements.studentScoreControls.addEventListener('click', (event) => {
    const key = event.target.closest('[data-score-key]')?.dataset.scoreKey;
    if (key) updateScoreDraft(key);
  });
  elements.clearStudentRecordButton.addEventListener('click', () => {
    const changed = store.clearStudentRecord(studentId);
    logLogicDebug('student record cleared', {
      assignmentId: store.getCurrentAssignment().id,
      studentId,
      changed
    });
    if (changed) showToast('已清除记录');
    close();
  });
  elements.saveStudentRecordButton.addEventListener('click', () => {
    const result = store.setScore(studentId, elements.studentScoreInput.value);
    if (result === 'invalid') {
      logLogicDebug('student score rejected', {
        assignmentId: store.getCurrentAssignment().id,
        studentId,
        draftLength: elements.studentScoreInput.value.length
      });
      elements.studentScoreError.textContent = '请输入 0–100 的分数，最多一位小数';
      elements.studentScoreInput.focus();
      return;
    }
    logLogicDebug('student score saved', {
      assignmentId: store.getCurrentAssignment().id,
      studentId,
      result
    });
    haptic(Haptic.medium);
    showToast('分数已保存');
    close();
  });

  return { open, close, sheet };
}
