import { elements } from './dom.js';
import { setActiveOverlay, setGradeSort, setTensScoreMode, state } from './state.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently } from './focus.js';
import { haptic, Haptic } from './haptics.js';
import { SCHEDULE_DAY_LABELS } from './roster-model.js';
import { describeDebugTarget, logCourseDebug } from './sheet-debug.js';
import { resolveGradeExamId } from './courses-renderer.js';
import { bindImmediateAction, createGhostClickGuard } from './pointer-guards.js';
import { GHOST_GUARD_MS } from './gesture-policy.js';
import { isTensScoreKey, renderScoreKeypad, syncTensToggle } from './score-keypad.js';

const MOVE_CANCEL_DISTANCE = 9;
const LONG_PRESS_MS = 480;
const CLICK_SUPPRESSION_MS = 450;
const STATS_PAGE_INDEX = 2;
const ASSIGNMENT_SUMMARY_SUBVIEW_INDEX = 0;

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
    `<section class="${className}-panel sheet-panel sheet-panel--top" role="dialog" aria-modal="true" aria-labelledby="${titleId}">`,
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
    '<div class="sheet-handle-zone sheet-handle-zone--bottom" aria-hidden="true"><div class="sheet-handle"></div></div>',
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
    '<div class="student-score-display-head">',
    '<label for="courseGradeInput">本次得分</label>',
    '<button type="button" class="student-score-tens-toggle" data-field="tens-toggle" aria-pressed="false" aria-label="整十模式">整十</button>',
    '</div>',
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
  const gradeLayer = createGradeSheet();
  const statsLayer = createStatsSheet();
  elements.app.append(slotLayer, periodLayer, subjectLayer, gradeLayer, statsLayer);

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


  const gradePanel = gradeLayer.querySelector('.course-grade-panel');
  const gradeEyebrow = gradeLayer.querySelector('[data-field="eyebrow"]');
  const gradeTitle = gradeLayer.querySelector('#courseGradeTitle');
  const gradeStatus = gradeLayer.querySelector('[data-field="status"]');
  const gradeInput = gradeLayer.querySelector('[data-field="input"]');
  const gradeError = gradeLayer.querySelector('[data-field="error"]');
  const gradeKeypad = gradeLayer.querySelector('[data-field="keypad"]');
  const gradeTensToggle = gradeLayer.querySelector('[data-field="tens-toggle"]');

  const statsPanel = statsLayer.querySelector('.course-stats-panel');
  const statsTitle = statsLayer.querySelector('#courseStatsTitle');
  const statsList = statsLayer.querySelector('[data-field="list"]');

  let slotSheet;
  let periodSheet;
  let subjectSheet;
  let gradeSheet;
  let statsSheet;
  let slotTarget = null;
  let periodTarget = null;
  let subjectTarget = null;
  let gradeTarget = null;
  let slotReturnFocus = null;
  let periodReturnFocus = null;
  let subjectReturnFocus = null;
  let gradeReturnFocus = null;
  let statsReturnFocus = null;
  const presses = new Map();
  /** Long-press targets that already opened their sheet; owned by pointerId until release. */
  const longPressedTargets = new Map();
  let suppressedClickTarget = null;
  let suppressLongPressUntil = 0;
  let suppressClickUntil = 0;
  /**
   * After save/clear/close on pointerdown, the trailing click can land on the
   * bottom nav (toggles 成绩→课表) or segment tabs / score cells underneath.
   * Also block underlay hit-testing so week-slot :active flash cannot show
   * while the same finger is still down after the sheet closes.
   * A new pointerdown is a deliberate next action and must not be swallowed.
   */
  const gridGhostGuard = createGhostClickGuard({
    owner: 'courses',
    appElement: elements.app,
    appClass: 'is-course-sheet-ghost-guard',
    hitSelector: '#nav, .nav-btn, .segment, #weekStrip, #gradeTable, .week-slot-cell, .week-period-label, .grade-score-cell, .grade-subject-head, .confirm-sheet',
    onArm: (until) => {
      suppressClickUntil = until;
    },
    onClear: () => {
      suppressClickUntil = 0;
    },
    onSwallow: (hit) => {
      logCourseDebug('ghost click suppressed', describeDebugTarget(hit));
    }
  });

  function armGridClickSuppress(ms = GHOST_GUARD_MS) {
    gridGhostGuard.arm(ms);
  }

  function bindCourseAction(button, action, label) {
    bindImmediateAction(button, action, {
      armGhost: armGridClickSuppress,
      owner: 'courses',
      onPointerDown: (event) => {
        logCourseDebug(`${label} pointerdown`, describeDebugTarget(event.target));
      },
      onClickDeduped: (_event, deltaMs) => {
        logCourseDebug(`${label} click deduped`, `Δ=${Math.round(deltaMs)}`);
      },
      onClickFallback: (event) => {
        logCourseDebug(`${label} click`, describeDebugTarget(event.target));
      }
    });
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


  function syncGradeKeypad() {
    renderScoreKeypad(gradeKeypad, { tensMode: state.tensScoreMode });
    syncTensToggle(gradeTensToggle, state.tensScoreMode);
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
    syncGradeKeypad();
    gradeSheet.openInstant();
    gradeInput.focus({ preventScroll: true });
  }

  function formatStatValue(value) {
    if (value === undefined) return '—';
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function fillStatsList(stats) {
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
  }

  function openStats({ returnFocus } = {}) {
    const onAssignmentSummary = state.currentPage === STATS_PAGE_INDEX
      && state.subviews[STATS_PAGE_INDEX] === ASSIGNMENT_SUMMARY_SUBVIEW_INDEX;
    if (onAssignmentSummary) {
      const stats = store.getAssignmentGradeStats();
      if (!stats.length) {
        showToast('当前没有作业');
        return;
      }
      closeOthers?.('course-stats');
      statsReturnFocus = returnFocus ?? null;
      statsTitle.textContent = '作业';
      fillStatsList(stats);
      statsSheet.openInstant();
      return;
    }

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
    fillStatsList(stats);
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

  function saveGrade(value = gradeInput.value) {
    if (!gradeTarget) return;
    const result = store.setCourseGrade(
      gradeTarget.examId,
      gradeTarget.studentId,
      gradeTarget.subjectId,
      value
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
    direction: 'from-top',
    scrollPorts: [slotPanel],
    isOpen: () => slotLayer.classList.contains('show') && !slotSheet?.isActive(),
    onRequestClose: closeSlot,
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
    direction: 'from-top',
    scrollPorts: [periodPanel],
    isOpen: () => periodLayer.classList.contains('show') && !periodSheet?.isActive(),
    onRequestClose: closePeriod,
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
    direction: 'from-top',
    scrollPorts: [subjectPanel],
    isOpen: () => subjectLayer.classList.contains('show') && !subjectSheet?.isActive(),
    onRequestClose: closeSubject,
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


  gradeSheet = createSheetController({
    id: 'course-grade',
    layer: gradeLayer,
    panel: gradePanel,
    direction: 'from-bottom',
    scrollPorts: [gradePanel],
    isOpen: () => gradeLayer.classList.contains('show') && !gradeSheet?.isActive(),
    onRequestClose: closeGrade,
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
    onRequestClose: closeStats,
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

  function suppressLongPressClick(target) {
    suppressedClickTarget = target;
    suppressLongPressUntil = performance.now() + CLICK_SUPPRESSION_MS;
  }

  function shouldSuppressClick(target) {
    if (target !== suppressedClickTarget) return false;
    const suppress = performance.now() < suppressLongPressUntil;
    suppressedClickTarget = null;
    suppressLongPressUntil = 0;
    return suppress;
  }

  function bindLongPress(root, selector, onLongPress) {
    root.addEventListener('pointerdown', (event) => {
      const target = event.target.closest(selector);
      if (!target || !root.contains(target)) return;
      // A new contact cannot belong to the long-press sequence whose click is pending.
      suppressedClickTarget = null;
      suppressLongPressUntil = 0;
      const press = {
        x: event.clientX,
        y: event.clientY,
        target,
        timer: null
      };
      press.timer = setTimeout(() => {
        if (!presses.has(event.pointerId)) return;
        clearPress(event.pointerId);
        // Opening the Sheet can retarget the eventual pointerup away from the root.
        // Keep ownership globally until that physical pointer sequence actually ends,
        // then arm the click guard at release — not from this earlier timeout.
        longPressedTargets.set(event.pointerId, target);
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
    const periodLabel = event.target.closest('.week-period-label');
    if (shouldSuppressClick(periodLabel)) {
      logCourseDebug('slot long-press click suppressed', describeDebugTarget(event.target));
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
    if (shouldSuppressClick(subjectHead)) {
      logCourseDebug('grade long-press click suppressed', describeDebugTarget(event.target));
      return;
    }
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

  window.addEventListener('pointerup', (event) => {
    const target = longPressedTargets.get(event.pointerId);
    if (!target) return;
    longPressedTargets.delete(event.pointerId);
    // Start the bounded guard from release, immediately before the browser may
    // synthesize click, rather than from the earlier long-press timeout.
    suppressLongPressClick(target);
  }, true);
  window.addEventListener('pointercancel', (event) => {
    longPressedTargets.delete(event.pointerId);
  }, true);



  guardTextFieldFocus(slotLayer, slotInput, 'slot');
  guardTextFieldFocus(periodLayer, periodInput, 'period');
  guardTextFieldFocus(subjectLayer, subjectInput, 'subject');
  bindInputTrace(slotInput, 'slot');
  bindInputTrace(periodInput, 'period');
  bindInputTrace(subjectInput, 'subject');

  bindCourseAction(slotLayer.querySelector('[data-action="cancel"]'), () => closeSlot(), 'slot cancel');
  bindCourseAction(slotLayer.querySelector('[data-action="save"]'), () => {
    logCourseDebug('slot save invoke', `valueLen=${slotInput.value.length}`);
    saveSlot();
  }, 'slot save');
  bindCourseAction(slotClear, () => {
    if (!slotTarget) return;
    const ok = store.clearScheduleSlot(slotTarget.day, slotTarget.periodId);
    showToast(ok ? '已清除该格' : '该格本来就是空的');
    closeSlot();
  }, 'slot clear');
  slotInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveSlot();
    }
  });

  bindCourseAction(periodLayer.querySelector('[data-action="cancel"]'), () => closePeriod(), 'period cancel');
  bindCourseAction(periodLayer.querySelector('[data-action="save"]'), () => savePeriod(), 'period save');
  periodInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      savePeriod();
    }
  });

  bindCourseAction(subjectLayer.querySelector('[data-action="cancel"]'), () => closeSubject(), 'subject cancel');
  bindCourseAction(subjectLayer.querySelector('[data-action="save"]'), () => saveSubject(), 'subject save');
  bindCourseAction(subjectDelete, () => deleteSubjectCurrent(), 'subject delete');
  subjectInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveSubject();
    }
  });


  bindCourseAction(gradeLayer.querySelector('[data-action="close"]'), () => closeGrade(), 'grade close');
  bindCourseAction(gradeLayer.querySelector('[data-action="save"]'), () => saveGrade(), 'grade save');
  bindCourseAction(gradeLayer.querySelector('[data-action="clear"]'), () => {
    if (!gradeTarget) return;
    const ok = store.clearCourseGrade(gradeTarget.examId, gradeTarget.studentId, gradeTarget.subjectId);
    showToast(ok ? '已清除成绩' : '当前没有成绩');
    closeGrade();
  }, 'grade clear');
  gradeTensToggle.addEventListener('click', () => {
    setTensScoreMode(!state.tensScoreMode);
    syncGradeKeypad();
  });
  gradeKeypad.addEventListener('click', (event) => {
    const key = event.target.closest('[data-score-key]')?.dataset.scoreKey;
    if (!key) return;
    if (state.tensScoreMode && isTensScoreKey(key)) {
      saveGrade(key);
      return;
    }
    updateGradeDraft(key);
  });

  bindCourseAction(statsLayer.querySelector('[data-action="close"]'), () => closeStats(), 'stats close');

  function dismissBack() {
    if (statsSheet.isPresented()) {
      closeStats();
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
    closeGrade,
    closeStats,
    openStats,
    dismissBack,
    slotSheet,
    periodSheet,
    subjectSheet,
    gradeSheet,
    statsSheet
  };
}
