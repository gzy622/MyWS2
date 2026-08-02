import { elements } from './dom.js';
import { setActiveOverlay, setTensScoreMode, state } from './state.js';
import { haptic, Haptic } from './haptics.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently, syncChromeInert } from './focus.js';
import { logLogicDebug } from './sheet-debug.js';
import { isTensScoreKey, renderScoreKeypad, syncTensToggle } from './score-keypad.js';

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

  function syncScoreKeypad() {
    renderScoreKeypad(elements.studentScoreControls, { tensMode: state.tensScoreMode });
    syncTensToggle(elements.studentScoreTensToggle, state.tensScoreMode);
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

  function saveScoreDraft(draft) {
    if (draft === '') {
      const cleared = store.clearStudentRecord(studentId);
      logLogicDebug('student score cleared', {
        assignmentId: store.getCurrentAssignment().id,
        studentId,
        cleared
      });
      haptic(Haptic.medium);
      showToast(cleared ? '已清空分数' : '没有可清空的记录');
      close();
      return;
    }
    const result = store.setScore(studentId, draft);
    if (result === 'invalid') {
      logLogicDebug('student score rejected', {
        assignmentId: store.getCurrentAssignment().id,
        studentId,
        draftLength: draft.length
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
  }

  sheet = createSheetController({
    id: 'student-record',
    layer: elements.studentRecordSheet,
    panel: elements.studentRecordPanel,
    direction: 'from-bottom',
    scrollPorts: [elements.studentRecordPanel],
    isOpen: () => elements.studentRecordSheet.classList.contains('show') && !sheet?.isActive(),
    onRequestClose: close,
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
    syncScoreKeypad();
    sheet.openInstant();
    elements.studentScoreInput.focus({ preventScroll: true });
  }

  elements.studentScoreTensToggle.addEventListener('click', () => {
    setTensScoreMode(!state.tensScoreMode);
    syncScoreKeypad();
  });
  elements.studentScoreControls.addEventListener('click', (event) => {
    const key = event.target.closest('[data-score-key]')?.dataset.scoreKey;
    if (!key) return;
    if (state.tensScoreMode && isTensScoreKey(key)) {
      saveScoreDraft(key);
      return;
    }
    updateScoreDraft(key);
  });
  elements.closeStudentRecordButton.addEventListener('click', close);
  elements.cancelStudentRecordButton.addEventListener('click', close);
  elements.saveStudentRecordButton.addEventListener('click', () => {
    saveScoreDraft(elements.studentScoreInput.value.trim());
  });

  return { open, close, sheet };
}
