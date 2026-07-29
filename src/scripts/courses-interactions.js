import { elements } from './dom.js';
import { setActiveOverlay, setGradeExamId, setGradeSort, state } from './state.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently } from './focus.js';
import { haptic, Haptic } from './haptics.js';
import { SCHEDULE_DAY_LABELS } from './roster-model.js';
import { describeDebugTarget, logCourseDebug } from './sheet-debug.js';
import { resolveGradeExamId } from './courses-renderer.js';

const MOVE_CANCEL_DISTANCE = 9;
const LONG_PRESS_MS = 480;
const CLICK_SUPPRESSION_MS = 250;

function isCoarsePointer() {
  return Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches)
    || Boolean(globalThis.Capacitor?.isNativePlatform?.());
}

function activeTag() {
  const el = document.activeElement;
  return el instanceof Element ? describeDebugTarget(el) : String(el);
}

/** Focus text fields without select-all on touch/native — select() breaks CJK IME on Android WebView. */
function focusCourseTextInput(input, label = 'input') {
  if (!(input instanceof HTMLInputElement)) return;
  logCourseDebug('focus scheduled', `${label} coarse=${isCoarsePointer()}`);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      if (!isCoarsePointer()) input.select();
      logCourseDebug('focus applied', `${label} active=${activeTag()} valueLen=${input.value.length}`);
    });
  });
}

/**
 * Keep sheet/page gesture router off the text field, and focus the input when
 * the tap lands on label/chrome (common on Android WebView).
 */
function guardTextFieldFocus(layer, input, label = 'field') {
  const field = layer.querySelector('.course-edit-field');
  if (!field || !(input instanceof HTMLInputElement)) return;
  field.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    if (event.button > 0) return;
    const before = activeTag();
    const hit = describeDebugTarget(event.target);
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
    logCourseDebug('field pointerdown', `${label} hit=${hit} before=${before} after=${activeTag()}`);
  }, { capture: true });
}

/**
 * Android WebView + IME: tapping Save blurs the field, --ime-inset-bottom drops,
 * the panel jumps, and the trailing synthetic click lands on the grid underneath
 * (re-opens the editor — looks like Save failed). Debug overlay can mask that
 * ghost click, which is why Save seemed to work only with the overlay open.
 *
 * Run on pointerdown (capture), cancel the gesture click, and arm grid suppress.
 */
function bindImmediateAction(button, action, label, armGridClickSuppress) {
  if (!(button instanceof HTMLElement)) return;
  let ranAt = 0;
  button.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    ranAt = performance.now();
    armGridClickSuppress?.(500);
    logCourseDebug(`${label} pointerdown`, describeDebugTarget(event.target));
    action(event);
  }, { capture: true });
  button.addEventListener('click', (event) => {
    if (performance.now() - ranAt < 500) {
      event.preventDefault();
      event.stopPropagation();
      logCourseDebug(`${label} click deduped`, `Δ=${Math.round(performance.now() - ranAt)}`);
      return;
    }
    armGridClickSuppress?.(500);
    logCourseDebug(`${label} click`, describeDebugTarget(event.target));
    action(event);
  });
}

function bindInputTrace(input, label) {
  if (!(input instanceof HTMLInputElement)) return;
  for (const type of ['focus', 'blur', 'input', 'compositionstart', 'compositionend', 'keydown']) {
    input.addEventListener(type, (event) => {
      const key = type === 'keydown' ? ` key=${event.key}` : '';
      logCourseDebug(`input ${type}`, `${label} valueLen=${input.value.length}${key} active=${activeTag()}`);
    });
  }
}

function createTextSheet(className, titleId, eyebrowDefault) {
  const layer = document.createElement('div');
  layer.className = className;
  layer.inert = true;
  layer.innerHTML = [
    `<section class="${className}-panel sheet-panel sheet-panel--bottom" role="dialog" aria-modal="true" aria-labelledby="${titleId}">`,
    '<div class="sheet-handle-zone sheet-handle-zone--top" aria-hidden="true"><div class="sheet-handle"></div></div>',
    `<div class="sheet-title"><span data-field="eyebrow">${eyebrowDefault}</span><h2 id="${titleId}">编辑</h2></div>`,
    '<p class="course-edit-hint" data-field="hint"></p>',
    '<label class="course-edit-field"><span data-field="label">名称</span>',
    // No HTML maxlength: Android WebView IME composition can break with maxlength.
    `<input type="text" data-field="input" autocomplete="off" enterkeyhint="done"></label>`,
    '<div class="course-edit-actions">',
    '<button type="button" data-action="cancel">取消</button>',
    '<button type="button" class="primary" data-action="save">保存</button>',
    '</div>',
    '<button type="button" class="course-edit-clear" data-action="clear" hidden>清除</button>',
    '<button type="button" class="course-edit-delete" data-action="delete" hidden>删除此项</button>',
    '</section>'
  ].join('');
  return layer;
}

function createGradeSheet() {
  const layer = document.createElement('div');
  layer.className = 'course-grade-sheet';
  layer.inert = true;
  layer.innerHTML = [
    '<section class="course-grade-panel sheet-panel sheet-panel--bottom" role="dialog" aria-modal="true" aria-labelledby="courseGradeTitle">',
    '<div class="student-record-handle-zone" aria-hidden="true"><div class="sheet-handle"></div></div>',
    '<div class="student-record-head sheet-head">',
    '<div class="sheet-title"><span data-field="eyebrow">成绩</span><h2 id="courseGradeTitle">录入</h2></div>',
    '<button type="button" class="sheet-close" data-action="close" aria-label="关闭">×</button>',
    '</div>',
    '<p class="student-record-status" data-field="status"></p>',
    '<div class="student-score-display">',
    '<label for="courseGradeInput">本次得分</label>',
    '<div><input id="courseGradeInput" data-field="input" inputmode="none" autocomplete="off" readonly aria-describedby="courseGradeError" /><span>/ 100</span></div>',
    '</div>',
    '<div class="student-score-keypad" data-field="keypad" role="group" aria-label="数字键盘">',
    '<button type="button" data-score-key="1">1</button><button type="button" data-score-key="2">2</button><button type="button" data-score-key="3">3</button>',
    '<button type="button" data-score-key="4">4</button><button type="button" data-score-key="5">5</button><button type="button" data-score-key="6">6</button>',
    '<button type="button" data-score-key="7">7</button><button type="button" data-score-key="8">8</button><button type="button" data-score-key="9">9</button>',
    '<button type="button" data-score-key=".">.</button><button type="button" data-score-key="0">0</button>',
    '<button type="button" data-score-key="backspace" aria-label="退格"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 6H9l-6 6 6 6h12zM11 9l6 6m0-6-6 6" /></svg></button>',
    '</div>',
    '<p id="courseGradeError" data-field="error" role="alert"></p>',
    '<div class="student-record-actions">',
    '<button type="button" data-action="clear">清除记录</button>',
    '<button type="button" data-action="save">保存</button>',
    '</div>',
    '</section>'
  ].join('');
  return layer;
}

function createStatsSheet() {
  const layer = document.createElement('div');
  layer.className = 'course-stats-sheet';
  layer.inert = true;
  layer.innerHTML = [
    '<section class="course-stats-panel sheet-panel sheet-panel--bottom" role="dialog" aria-modal="true" aria-labelledby="courseStatsTitle">',
    '<div class="sheet-handle-zone sheet-handle-zone--top" aria-hidden="true"><div class="sheet-handle"></div></div>',
    '<div class="student-record-head sheet-head">',
    '<div class="sheet-title"><span data-field="eyebrow">统计</span><h2 id="courseStatsTitle">成绩</h2></div>',
    '<button type="button" class="sheet-close" data-action="close" aria-label="关闭">×</button>',
    '</div>',
    '<div class="course-stats-list" data-field="list" role="list"></div>',
    '</section>'
  ].join('');
  return layer;
}

export function initCoursesInteractions({ store, showToast, viewport, closeOthers, confirm, onGradesUiChange }) {
  const slotLayer = createTextSheet('course-slot-sheet', 'courseSlotTitle', '课表');
  const periodLayer = createTextSheet('course-period-sheet', 'coursePeriodTitle', '课表');
  const subjectLayer = createTextSheet('course-subject-sheet', 'courseSubjectTitle', '成绩');
  const examLayer = createTextSheet('course-exam-sheet', 'courseExamTitle', '考试');
  const gradeLayer = createGradeSheet();
  const statsLayer = createStatsSheet();
  elements.app.append(slotLayer, periodLayer, subjectLayer, examLayer, gradeLayer, statsLayer);

  const slotPanel = slotLayer.querySelector('.course-slot-sheet-panel');
  const slotEyebrow = slotLayer.querySelector('[data-field="eyebrow"]');
  const slotTitle = slotLayer.querySelector('#courseSlotTitle');
  const slotHint = slotLayer.querySelector('[data-field="hint"]');
  const slotLabel = slotLayer.querySelector('[data-field="label"]');
  const slotInput = slotLayer.querySelector('[data-field="input"]');
  const slotClear = slotLayer.querySelector('[data-action="clear"]');

  const periodPanel = periodLayer.querySelector('.course-period-sheet-panel');
  const periodTitle = periodLayer.querySelector('#coursePeriodTitle');
  const periodHint = periodLayer.querySelector('[data-field="hint"]');
  const periodLabel = periodLayer.querySelector('[data-field="label"]');
  const periodInput = periodLayer.querySelector('[data-field="input"]');

  const subjectPanel = subjectLayer.querySelector('.course-subject-sheet-panel');
  const subjectTitleEl = subjectLayer.querySelector('#courseSubjectTitle');
  const subjectHint = subjectLayer.querySelector('[data-field="hint"]');
  const subjectLabel = subjectLayer.querySelector('[data-field="label"]');
  const subjectInput = subjectLayer.querySelector('[data-field="input"]');
  const subjectDelete = subjectLayer.querySelector('[data-action="delete"]');

  const examPanel = examLayer.querySelector('.course-exam-sheet-panel');
  const examTitleEl = examLayer.querySelector('#courseExamTitle');
  const examHint = examLayer.querySelector('[data-field="hint"]');
  const examLabel = examLayer.querySelector('[data-field="label"]');
  const examInput = examLayer.querySelector('[data-field="input"]');
  const examDelete = examLayer.querySelector('[data-action="delete"]');

  const gradePanel = gradeLayer.querySelector('.course-grade-panel');
  const gradeEyebrow = gradeLayer.querySelector('[data-field="eyebrow"]');
  const gradeTitle = gradeLayer.querySelector('#courseGradeTitle');
  const gradeStatus = gradeLayer.querySelector('[data-field="status"]');
  const gradeInput = gradeLayer.querySelector('[data-field="input"]');
  const gradeError = gradeLayer.querySelector('[data-field="error"]');
  const gradeKeypad = gradeLayer.querySelector('[data-field="keypad"]');

  const statsPanel = statsLayer.querySelector('.course-stats-panel');
  const statsTitle = statsLayer.querySelector('#courseStatsTitle');
  const statsList = statsLayer.querySelector('[data-field="list"]');

  let slotSheet;
  let periodSheet;
  let subjectSheet;
  let examSheet;
  let gradeSheet;
  let statsSheet;
  let slotTarget = null;
  let periodTarget = null;
  let subjectTarget = null;
  let examTarget = null;
  let gradeTarget = null;
  let slotReturnFocus = null;
  let periodReturnFocus = null;
  let subjectReturnFocus = null;
  let examReturnFocus = null;
  let gradeReturnFocus = null;
  let statsReturnFocus = null;
  const presses = new Map();
  let suppressClickUntil = 0;
  let ghostGuard = null;
  let ghostPointerGuard = null;
  let ghostGuardTimer = 0;

  function clearGridClickSuppress() {
    if (ghostGuard) document.removeEventListener('click', ghostGuard, true);
    if (ghostPointerGuard) document.removeEventListener('pointerdown', ghostPointerGuard, true);
    if (ghostGuardTimer) window.clearTimeout(ghostGuardTimer);
    ghostGuard = null;
    ghostPointerGuard = null;
    ghostGuardTimer = 0;
    suppressClickUntil = 0;
  }

  /**
   * After save/clear/close on pointerdown, the trailing click can land on the
   * bottom nav (toggles 成绩→课表) or segment tabs / score cells underneath.
   * A new pointerdown is a deliberate next action and must not be swallowed.
   */
  function armGridClickSuppress(ms = 500) {
    clearGridClickSuppress();
    suppressClickUntil = performance.now() + ms;
    const until = suppressClickUntil;
    ghostGuard = (event) => {
      if (performance.now() >= until) {
        clearGridClickSuppress();
        return;
      }
      const hit = event.target;
      clearGridClickSuppress();
      if (!(hit instanceof Element)) return;
      if (!hit.closest(
        '#nav, .nav-btn, .segment, #weekStrip, #gradeTable, #gradeExamTabs, .week-slot-cell, .week-period-label, .grade-score-cell, .grade-subject-head, .grade-exam-tab, .confirm-sheet'
      )) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      logCourseDebug('ghost click suppressed', describeDebugTarget(hit));
    };
    ghostPointerGuard = clearGridClickSuppress;
    document.addEventListener('click', ghostGuard, true);
    document.addEventListener('pointerdown', ghostPointerGuard, true);
    ghostGuardTimer = window.setTimeout(clearGridClickSuppress, ms);
  }

  function closeSlot({ restoreFocus = true } = {}) {
    if (!slotSheet?.isPresented() && !slotLayer.classList.contains('show')) return;
    if (!restoreFocus) slotReturnFocus = null;
    if (slotSheet?.isPresented()) slotSheet.closeInstant();
    else {
      slotLayer.classList.remove('show');
      slotLayer.inert = true;
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = slotReturnFocus;
      slotTarget = null;
      slotReturnFocus = null;
      if (restoreFocus && focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function closePeriod({ restoreFocus = true } = {}) {
    if (!periodSheet?.isPresented() && !periodLayer.classList.contains('show')) return;
    if (!restoreFocus) periodReturnFocus = null;
    if (periodSheet?.isPresented()) periodSheet.closeInstant();
    else {
      periodLayer.classList.remove('show');
      periodLayer.inert = true;
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = periodReturnFocus;
      periodTarget = null;
      periodReturnFocus = null;
      if (restoreFocus && focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function closeSubject({ restoreFocus = true } = {}) {
    if (!subjectSheet?.isPresented() && !subjectLayer.classList.contains('show')) return;
    if (!restoreFocus) subjectReturnFocus = null;
    if (subjectSheet?.isPresented()) subjectSheet.closeInstant();
    else {
      subjectLayer.classList.remove('show');
      subjectLayer.inert = true;
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = subjectReturnFocus;
      subjectTarget = null;
      subjectReturnFocus = null;
      if (restoreFocus && focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function closeExam({ restoreFocus = true } = {}) {
    if (!examSheet?.isPresented() && !examLayer.classList.contains('show')) return;
    if (!restoreFocus) examReturnFocus = null;
    if (examSheet?.isPresented()) examSheet.closeInstant();
    else {
      examLayer.classList.remove('show');
      examLayer.inert = true;
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = examReturnFocus;
      examTarget = null;
      examReturnFocus = null;
      if (restoreFocus && focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function closeGrade({ restoreFocus = true } = {}) {
    if (!gradeSheet?.isPresented() && !gradeLayer.classList.contains('show')) return;
    if (!restoreFocus) gradeReturnFocus = null;
    if (gradeSheet?.isPresented()) gradeSheet.closeInstant();
    else {
      gradeLayer.classList.remove('show');
      gradeLayer.inert = true;
      setActiveOverlay(null);
      const focus = gradeReturnFocus;
      gradeTarget = null;
      gradeReturnFocus = null;
      if (restoreFocus && focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function closeStats({ restoreFocus = true } = {}) {
    if (!statsSheet?.isPresented() && !statsLayer.classList.contains('show')) return;
    if (!restoreFocus) statsReturnFocus = null;
    if (statsSheet?.isPresented()) statsSheet.closeInstant();
    else {
      statsLayer.classList.remove('show');
      statsLayer.inert = true;
      setActiveOverlay(null);
      const focus = statsReturnFocus;
      statsReturnFocus = null;
      if (restoreFocus && focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function notifyGradesUiChange() {
    onGradesUiChange?.();
  }

  function currentExamId(snapshot = store.getSnapshot()) {
    return resolveGradeExamId(snapshot);
  }

  function openSlot(day, periodId, trigger) {
    const snapshot = store.getSnapshot();
    const period = snapshot.periods.find((item) => item.id === periodId);
    if (!period || day < 0 || day >= SCHEDULE_DAY_LABELS.length) {
      logCourseDebug('openSlot rejected', `day=${day} periodId=${periodId}`);
      return;
    }
    closeOthers?.('course-slot');
    slotTarget = { day, periodId };
    slotReturnFocus = trigger;
    const current = store.getScheduleSlot(day, periodId) ?? '';
    slotEyebrow.textContent = '课表';
    slotTitle.textContent = `周${SCHEDULE_DAY_LABELS[day]} · ${period.title}`;
    slotHint.textContent = '填写科目简称，保存后显示在课表格中。';
    slotLabel.textContent = '科目';
    slotInput.value = current;
    slotClear.hidden = !current;
    viewport?.lockStudentGrid?.();
    logCourseDebug('openSlot', `day=${day} period=${periodId} currentLen=${current.length} show=${slotLayer.classList.contains('show')}`);
    slotSheet.openInstant();
    logCourseDebug('openSlot after openInstant', `presented=${slotSheet.isPresented()} inert=${slotLayer.inert} show=${slotLayer.classList.contains('show')}`);
  }

  function openPeriod(periodId, trigger) {
    const snapshot = store.getSnapshot();
    const period = snapshot.periods.find((item) => item.id === periodId);
    if (!period) return;
    closeOthers?.('course-period');
    periodTarget = { periodId };
    periodReturnFocus = trigger;
    periodTitle.textContent = period.title;
    periodHint.textContent = '节次结构固定，仅可修改显示名称。';
    periodLabel.textContent = '节次名称';
    periodInput.value = period.title;
    viewport?.lockStudentGrid?.();
    periodSheet.openInstant();
  }

  function openSubject(subjectId, trigger) {
    const snapshot = store.getSnapshot();
    const subject = snapshot.subjects.find((item) => item.id === subjectId);
    if (!subject) return;
    closeOthers?.('course-subject');
    subjectTarget = { subjectId };
    subjectReturnFocus = trigger;
    subjectTitleEl.textContent = subject.title;
    subjectHint.textContent = '删除后该科成绩一并清除，且不可恢复。';
    subjectLabel.textContent = '科目名称';
    subjectInput.value = subject.title;
    subjectDelete.hidden = false;
    subjectDelete.disabled = snapshot.subjects.length <= 1;
    viewport?.lockStudentGrid?.();
    subjectSheet.openInstant();
  }

  function openExam(examId, trigger) {
    const snapshot = store.getSnapshot();
    const exam = snapshot.exams.find((item) => item.id === examId);
    if (!exam) return;
    closeOthers?.('course-exam');
    examTarget = { examId };
    examReturnFocus = trigger;
    examTitleEl.textContent = exam.title;
    examHint.textContent = '删除后该场考试成绩一并清除，且不可恢复。';
    examLabel.textContent = '考试名称';
    examInput.value = exam.title;
    examDelete.hidden = false;
    examDelete.disabled = snapshot.exams.length <= 1;
    viewport?.lockStudentGrid?.();
    examSheet.openInstant();
  }

  function openGrade(studentId, subjectId, trigger) {
    const snapshot = store.getSnapshot();
    const examId = currentExamId(snapshot);
    const student = snapshot.students.find((item) => item.id === studentId);
    const subject = snapshot.subjects.find((item) => item.id === subjectId);
    const exam = snapshot.exams.find((item) => item.id === examId);
    if (!student || !subject || !exam) return;
    closeOthers?.('course-grade');
    gradeTarget = { examId, studentId, subjectId };
    gradeReturnFocus = trigger;
    gradeEyebrow.textContent = `${exam.title} · ${subject.title}`;
    gradeTitle.textContent = student.name;
    const score = store.getCourseGrade(examId, studentId, subjectId);
    gradeStatus.textContent = score !== undefined ? `已计分 · ${score} 分` : '未计分';
    gradeInput.value = score === undefined ? '' : String(score);
    gradeError.textContent = '';
    gradeSheet.openInstant();
    gradeInput.focus({ preventScroll: true });
  }

  function formatStatValue(value) {
    if (value === undefined) return '—';
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function openStats({ returnFocus } = {}) {
    const snapshot = store.getSnapshot();
    const examId = currentExamId(snapshot);
    const exam = snapshot.exams.find((item) => item.id === examId);
    if (!exam) {
      showToast('当前没有考试');
      return;
    }
    const stats = store.getExamGradeStats(examId);
    closeOthers?.('course-stats');
    statsReturnFocus = returnFocus ?? null;
    statsTitle.textContent = exam.title;
    const fragment = document.createDocumentFragment();
    for (const row of stats) {
      const item = document.createElement('div');
      item.className = 'course-stats-row';
      item.setAttribute('role', 'listitem');
      const title = document.createElement('div');
      title.className = 'course-stats-subject';
      title.textContent = row.title;
      const metrics = document.createElement('div');
      metrics.className = 'course-stats-metrics';
      if (row.count === 0) {
        metrics.textContent = '未录入';
      } else {
        metrics.innerHTML = [
          `<span>平均 <strong>${formatStatValue(row.average)}</strong></span>`,
          `<span>最高 <strong>${formatStatValue(row.max)}</strong></span>`,
          `<span>最低 <strong>${formatStatValue(row.min)}</strong></span>`,
          `<span>已录 <strong>${row.count}/${row.studentCount}</strong></span>`
        ].join('');
      }
      item.append(title, metrics);
      fragment.append(item);
    }
    statsList.replaceChildren(fragment);
    statsSheet.openInstant();
  }

  function cycleSubjectSort(subjectId) {
    const current = state.gradeSort;
    if (!current || current.subjectId !== subjectId) {
      setGradeSort({ subjectId, direction: 'desc' });
    } else if (current.direction === 'desc') {
      setGradeSort({ subjectId, direction: 'asc' });
    } else {
      setGradeSort(null);
    }
    notifyGradesUiChange();
  }

  function selectExam(examId) {
    if (!Number.isSafeInteger(examId)) return;
    if (state.gradeExamId === examId) return;
    setGradeExamId(examId);
    notifyGradesUiChange();
  }

  function saveSlot() {
    if (!slotTarget) {
      logCourseDebug('saveSlot skipped', 'no slotTarget');
      return;
    }
    const value = slotInput.value.trim();
    logCourseDebug('saveSlot', `rawLen=${slotInput.value.length} trimLen=${value.length} day=${slotTarget.day} period=${slotTarget.periodId}`);
    if (!value) {
      showToast('请输入科目，或使用清除');
      return;
    }
    if (!store.setScheduleSlot(slotTarget.day, slotTarget.periodId, value)) {
      logCourseDebug('saveSlot store rejected', value);
      showToast('请输入有效科目名称');
      return;
    }
    haptic(Haptic.light);
    showToast('已更新课表');
    closeSlot();
  }

  function savePeriod() {
    if (!periodTarget) return;
    if (!store.renamePeriod(periodTarget.periodId, periodInput.value.trim())) {
      showToast('请输入有效且不同的节次名称');
      return;
    }
    showToast('已更新节次名称');
    closePeriod();
  }

  function saveSubject() {
    if (!subjectTarget) return;
    if (!store.renameSubject(subjectTarget.subjectId, subjectInput.value.trim())) {
      showToast('请输入有效且不同的科目名称');
      return;
    }
    showToast('已更新科目名称');
    closeSubject();
  }

  function deleteSubjectCurrent() {
    if (!subjectTarget) return;
    const snapshot = store.getSnapshot();
    const subject = snapshot.subjects.find((item) => item.id === subjectTarget.subjectId);
    if (!subject) return;
    const id = subject.id;
    const label = subject.title;
    confirm?.({
      title: '删除科目',
      message: `将删除科目「${label}」及其全部成绩。`,
      returnFocus: subjectReturnFocus,
      action: () => {
        const ok = store.deleteSubject(id);
        if (!ok) showToast('至少保留一个科目');
        else {
          if (state.gradeSort?.subjectId === id) {
            setGradeSort(null);
            notifyGradesUiChange();
          }
          showToast(`已删除「${label}」`);
        }
      }
    });
    closeSubject({ restoreFocus: false });
  }

  function saveExam() {
    if (!examTarget) return;
    if (!store.renameExam(examTarget.examId, examInput.value.trim())) {
      showToast('请输入有效且不同的考试名称');
      return;
    }
    showToast('已更新考试名称');
    closeExam();
  }

  function deleteExamCurrent() {
    if (!examTarget) return;
    const snapshot = store.getSnapshot();
    const exam = snapshot.exams.find((item) => item.id === examTarget.examId);
    if (!exam) return;
    const id = exam.id;
    const label = exam.title;
    confirm?.({
      title: '删除考试',
      message: `将删除考试「${label}」及其全部成绩。`,
      returnFocus: examReturnFocus,
      action: () => {
        const ok = store.deleteExam(id);
        if (!ok) {
          showToast('至少保留一场考试');
          return;
        }
        if (state.gradeExamId === id) {
          setGradeExamId(null);
          notifyGradesUiChange();
        }
        showToast(`已删除「${label}」`);
      }
    });
    closeExam({ restoreFocus: false });
  }

  function updateGradeDraft(key) {
    const current = gradeInput.value;
    if (key === 'backspace') {
      gradeInput.value = current.slice(0, -1);
    } else if (key === '.') {
      if (!current.includes('.') && current !== '100') gradeInput.value = current ? `${current}.` : '0.';
    } else if (/^\d$/.test(key)) {
      const next = current === '0' ? key : `${current}${key}`;
      const fraction = next.split('.')[1];
      if ((!fraction || fraction.length <= 1) && Number(next) <= 100) gradeInput.value = next;
    }
    gradeError.textContent = '';
  }

  function saveGrade() {
    if (!gradeTarget) return;
    const result = store.setCourseGrade(
      gradeTarget.examId,
      gradeTarget.studentId,
      gradeTarget.subjectId,
      gradeInput.value
    );
    if (result !== 'saved') {
      gradeError.textContent = '请输入 0～100，最多一位小数';
      return;
    }
    haptic(Haptic.light);
    showToast('已保存成绩');
    closeGrade();
  }

  slotSheet = createSheetController({
    id: 'course-slot',
    layer: slotLayer,
    panel: slotPanel,
    direction: 'from-bottom',
    scrollPorts: [slotPanel],
    isOpen: () => slotLayer.classList.contains('show') && !slotSheet?.isActive(),
    onPrepare() {
      setActiveOverlay('course-slot');
      slotLayer.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('course-slot');
      slotLayer.inert = false;
      slotLayer.classList.add('show');
      logCourseDebug('slot onOpened', `inert=${slotLayer.inert} active=${activeTag()}`);
      focusCourseTextInput(slotInput, 'slot');
    },
    onClosed() {
      slotLayer.classList.remove('show');
      slotLayer.inert = true;
      slotLayer.setAttribute('aria-hidden', 'true');
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = slotReturnFocus;
      slotTarget = null;
      slotReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  periodSheet = createSheetController({
    id: 'course-period',
    layer: periodLayer,
    panel: periodPanel,
    direction: 'from-bottom',
    scrollPorts: [periodPanel],
    isOpen: () => periodLayer.classList.contains('show') && !periodSheet?.isActive(),
    onPrepare() {
      setActiveOverlay('course-period');
      periodLayer.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('course-period');
      periodLayer.inert = false;
      periodLayer.classList.add('show');
      logCourseDebug('period onOpened', `active=${activeTag()}`);
      focusCourseTextInput(periodInput, 'period');
    },
    onClosed() {
      periodLayer.classList.remove('show');
      periodLayer.inert = true;
      periodLayer.setAttribute('aria-hidden', 'true');
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = periodReturnFocus;
      periodTarget = null;
      periodReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  subjectSheet = createSheetController({
    id: 'course-subject',
    layer: subjectLayer,
    panel: subjectPanel,
    direction: 'from-bottom',
    scrollPorts: [subjectPanel],
    isOpen: () => subjectLayer.classList.contains('show') && !subjectSheet?.isActive(),
    onPrepare() {
      setActiveOverlay('course-subject');
      subjectLayer.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('course-subject');
      subjectLayer.inert = false;
      subjectLayer.classList.add('show');
      logCourseDebug('subject onOpened', `active=${activeTag()}`);
      focusCourseTextInput(subjectInput, 'subject');
    },
    onClosed() {
      subjectLayer.classList.remove('show');
      subjectLayer.inert = true;
      subjectLayer.setAttribute('aria-hidden', 'true');
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = subjectReturnFocus;
      subjectTarget = null;
      subjectReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  examSheet = createSheetController({
    id: 'course-exam',
    layer: examLayer,
    panel: examPanel,
    direction: 'from-bottom',
    scrollPorts: [examPanel],
    isOpen: () => examLayer.classList.contains('show') && !examSheet?.isActive(),
    onPrepare() {
      setActiveOverlay('course-exam');
      examLayer.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('course-exam');
      examLayer.inert = false;
      examLayer.classList.add('show');
      focusCourseTextInput(examInput, 'exam');
    },
    onClosed() {
      examLayer.classList.remove('show');
      examLayer.inert = true;
      examLayer.setAttribute('aria-hidden', 'true');
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = examReturnFocus;
      examTarget = null;
      examReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  gradeSheet = createSheetController({
    id: 'course-grade',
    layer: gradeLayer,
    panel: gradePanel,
    direction: 'from-bottom',
    scrollPorts: [gradePanel],
    isOpen: () => gradeLayer.classList.contains('show') && !gradeSheet?.isActive(),
    onPrepare() {
      setActiveOverlay('course-grade');
      gradeLayer.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('course-grade');
      gradeLayer.inert = false;
      gradeLayer.classList.add('show');
    },
    onClosed() {
      gradeLayer.classList.remove('show');
      gradeLayer.inert = true;
      gradeLayer.setAttribute('aria-hidden', 'true');
      setActiveOverlay(null);
      const focus = gradeReturnFocus;
      gradeTarget = null;
      gradeReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  statsSheet = createSheetController({
    id: 'course-stats',
    layer: statsLayer,
    panel: statsPanel,
    direction: 'from-bottom',
    scrollPorts: [statsPanel, statsList],
    isOpen: () => statsLayer.classList.contains('show') && !statsSheet?.isActive(),
    onPrepare() {
      setActiveOverlay('course-stats');
      statsLayer.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('course-stats');
      statsLayer.inert = false;
      statsLayer.classList.add('show');
    },
    onClosed() {
      statsLayer.classList.remove('show');
      statsLayer.inert = true;
      statsLayer.setAttribute('aria-hidden', 'true');
      setActiveOverlay(null);
      const focus = statsReturnFocus;
      statsReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  function clearPress(pointerId) {
    const press = presses.get(pointerId);
    if (press) clearTimeout(press.timer);
    presses.delete(pointerId);
  }

  function bindLongPress(root, selector, onLongPress) {
    root.addEventListener('pointerdown', (event) => {
      const target = event.target.closest(selector);
      if (!target || !root.contains(target)) return;
      const press = {
        x: event.clientX,
        y: event.clientY,
        target,
        timer: null
      };
      press.timer = setTimeout(() => {
        if (!presses.has(event.pointerId)) return;
        clearPress(event.pointerId);
        suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
        haptic(Haptic.medium);
        onLongPress(target);
      }, LONG_PRESS_MS);
      presses.set(event.pointerId, press);
    });
    root.addEventListener('pointermove', (event) => {
      const press = presses.get(event.pointerId);
      if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) <= MOVE_CANCEL_DISTANCE) return;
      clearPress(event.pointerId);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) {
      root.addEventListener(type, (event) => clearPress(event.pointerId));
    }
    root.addEventListener('contextmenu', (event) => {
      const target = event.target.closest(selector);
      if (!target || !root.contains(target)) return;
      event.preventDefault();
      onLongPress(target);
    });
  }

  elements.weekStrip.addEventListener('click', (event) => {
    if (performance.now() < suppressClickUntil) {
      logCourseDebug('slot click suppressed', `untilΔ=${Math.round(suppressClickUntil - performance.now())} hit=${describeDebugTarget(event.target)}`);
      return;
    }
    const cell = event.target.closest('.week-slot-cell');
    if (cell && elements.weekStrip.contains(cell)) {
      logCourseDebug('slot click', `day=${cell.dataset.day} period=${cell.dataset.periodId} hit=${describeDebugTarget(event.target)}`);
      openSlot(Number(cell.dataset.day), Number(cell.dataset.periodId), cell);
      return;
    }
  });

  bindLongPress(elements.weekStrip, '.week-period-label', (target) => {
    openPeriod(Number(target.dataset.periodId), target);
  });

  elements.gradeTable.addEventListener('click', (event) => {
    if (performance.now() < suppressClickUntil) return;
    const subjectHead = event.target.closest('.grade-subject-head');
    if (subjectHead && elements.gradeTable.contains(subjectHead)) {
      cycleSubjectSort(Number(subjectHead.dataset.subjectId));
      return;
    }
    const cell = event.target.closest('.grade-score-cell');
    if (cell && elements.gradeTable.contains(cell)) {
      openGrade(Number(cell.dataset.studentId), Number(cell.dataset.subjectId), cell);
    }
  });

  bindLongPress(elements.gradeTable, '.grade-subject-head', (target) => {
    openSubject(Number(target.dataset.subjectId), target);
  });

  elements.gradeExamTabs.addEventListener('click', (event) => {
    if (performance.now() < suppressClickUntil) return;
    const tab = event.target.closest('.grade-exam-tab');
    if (!tab || !elements.gradeExamTabs.contains(tab)) return;
    selectExam(Number(tab.dataset.examId));
  });

  bindLongPress(elements.gradeExamTabs, '.grade-exam-tab', (target) => {
    openExam(Number(target.dataset.examId), target);
  });

  guardTextFieldFocus(slotLayer, slotInput, 'slot');
  guardTextFieldFocus(periodLayer, periodInput, 'period');
  guardTextFieldFocus(subjectLayer, subjectInput, 'subject');
  guardTextFieldFocus(examLayer, examInput, 'exam');
  bindInputTrace(slotInput, 'slot');
  bindInputTrace(periodInput, 'period');
  bindInputTrace(subjectInput, 'subject');
  bindInputTrace(examInput, 'exam');

  bindImmediateAction(slotLayer.querySelector('[data-action="cancel"]'), () => closeSlot(), 'slot cancel', armGridClickSuppress);
  bindImmediateAction(slotLayer.querySelector('[data-action="save"]'), () => {
    logCourseDebug('slot save invoke', `valueLen=${slotInput.value.length}`);
    saveSlot();
  }, 'slot save', armGridClickSuppress);
  bindImmediateAction(slotClear, () => {
    if (!slotTarget) return;
    const ok = store.clearScheduleSlot(slotTarget.day, slotTarget.periodId);
    showToast(ok ? '已清除该格' : '该格本来就是空的');
    closeSlot();
  }, 'slot clear', armGridClickSuppress);
  slotLayer.addEventListener('click', (event) => {
    if (event.target === slotLayer && !slotSheet.isActive()) closeSlot();
  });
  slotInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveSlot();
    }
  });

  bindImmediateAction(periodLayer.querySelector('[data-action="cancel"]'), () => closePeriod(), 'period cancel', armGridClickSuppress);
  bindImmediateAction(periodLayer.querySelector('[data-action="save"]'), () => savePeriod(), 'period save', armGridClickSuppress);
  periodLayer.addEventListener('click', (event) => {
    if (event.target === periodLayer && !periodSheet.isActive()) closePeriod();
  });
  periodInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      savePeriod();
    }
  });

  bindImmediateAction(subjectLayer.querySelector('[data-action="cancel"]'), () => closeSubject(), 'subject cancel', armGridClickSuppress);
  bindImmediateAction(subjectLayer.querySelector('[data-action="save"]'), () => saveSubject(), 'subject save', armGridClickSuppress);
  bindImmediateAction(subjectDelete, () => deleteSubjectCurrent(), 'subject delete', armGridClickSuppress);
  subjectLayer.addEventListener('click', (event) => {
    if (event.target === subjectLayer && !subjectSheet.isActive()) closeSubject();
  });
  subjectInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveSubject();
    }
  });

  bindImmediateAction(examLayer.querySelector('[data-action="cancel"]'), () => closeExam(), 'exam cancel', armGridClickSuppress);
  bindImmediateAction(examLayer.querySelector('[data-action="save"]'), () => saveExam(), 'exam save', armGridClickSuppress);
  bindImmediateAction(examDelete, () => deleteExamCurrent(), 'exam delete', armGridClickSuppress);
  examLayer.addEventListener('click', (event) => {
    if (event.target === examLayer && !examSheet.isActive()) closeExam();
  });
  examInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveExam();
    }
  });

  bindImmediateAction(gradeLayer.querySelector('[data-action="close"]'), () => closeGrade(), 'grade close', armGridClickSuppress);
  bindImmediateAction(gradeLayer.querySelector('[data-action="save"]'), () => saveGrade(), 'grade save', armGridClickSuppress);
  bindImmediateAction(gradeLayer.querySelector('[data-action="clear"]'), () => {
    if (!gradeTarget) return;
    const ok = store.clearCourseGrade(gradeTarget.examId, gradeTarget.studentId, gradeTarget.subjectId);
    showToast(ok ? '已清除成绩' : '当前没有成绩');
    closeGrade();
  }, 'grade clear', armGridClickSuppress);
  gradeKeypad.addEventListener('pointerdown', (event) => {
    const key = event.target.closest('[data-score-key]')?.dataset.scoreKey;
    if (!key) return;
    event.stopPropagation();
    updateGradeDraft(key);
  }, { capture: true });
  gradeLayer.addEventListener('click', (event) => {
    if (event.target === gradeLayer && !gradeSheet.isActive()) closeGrade();
  });

  bindImmediateAction(statsLayer.querySelector('[data-action="close"]'), () => closeStats(), 'stats close', armGridClickSuppress);
  statsLayer.addEventListener('click', (event) => {
    if (event.target === statsLayer && !statsSheet.isActive()) closeStats();
  });

  function dismissBack() {
    if (statsSheet.isPresented()) {
      closeStats();
      return true;
    }
    if (examSheet.isPresented()) {
      closeExam();
      return true;
    }
    if (subjectSheet.isPresented()) {
      closeSubject();
      return true;
    }
    if (periodSheet.isPresented()) {
      closePeriod();
      return true;
    }
    if (slotSheet.isPresented()) {
      closeSlot();
      return true;
    }
    if (gradeSheet.isPresented()) {
      closeGrade();
      return true;
    }
    return false;
  }

  return {
    closeSlot,
    closePeriod,
    closeSubject,
    closeExam,
    closeGrade,
    closeStats,
    openStats,
    dismissBack,
    slotSheet,
    periodSheet,
    subjectSheet,
    examSheet,
    gradeSheet,
    statsSheet
  };
}
