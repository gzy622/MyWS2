import { elements } from './dom.js';
import { state, setActiveOverlay, setGradeExamId } from './state.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently, syncChromeInert } from './focus.js';
import { resolveGradeExamId } from './courses-renderer.js';
import { renderTopbarTitle } from './navigation.js';
import { bindImmediateAction, createGhostClickGuard } from './pointer-guards.js';

const STATS_PAGE_INDEX = 2;
const GRADES_SUBVIEW_INDEX = 1;

function isCourseGradesView() {
  return state.currentPage === STATS_PAGE_INDEX
    && state.subviews[STATS_PAGE_INDEX] === GRADES_SUBVIEW_INDEX;
}

export function initExams({ store, showToast, viewport, closeOthers, confirm, onGradesUiChange }) {
  const layer = document.createElement('div');
  layer.className = 'exam-sheet';
  layer.inert = true;
  layer.innerHTML = '<section class="exam-panel sheet-panel sheet-panel--top" role="dialog" aria-modal="true" aria-labelledby="examListTitle"><header class="sheet-head"><div class="sheet-title"><span>统计</span><h2 id="examListTitle">考试</h2></div><button type="button" class="sheet-close" data-action="close" aria-label="关闭">×</button></header><div class="exam-list scroll-thin"></div><button class="exam-add" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新增考试</button><div class="sheet-handle-zone sheet-handle-zone--bottom" aria-hidden="true"><div class="sheet-handle"></div></div></section>';
  elements.app.append(layer);

  const list = layer.querySelector('.exam-list');
  const addButton = layer.querySelector('.exam-add');
  const listPanel = layer.querySelector('.exam-panel');
  const nameLayer = document.createElement('div');
  nameLayer.className = 'exam-name-sheet';
  nameLayer.inert = true;
  nameLayer.innerHTML = '<section class="exam-name-panel sheet-panel sheet-panel--top" role="dialog" aria-modal="true" aria-labelledby="examRenameTitle"><div class="sheet-title"><span>考试</span><h2 id="examRenameTitle">修改名称</h2></div><p class="exam-name-hint">新名称会同步显示在统计页顶栏。</p><label class="exam-name-field"><span>名称</span><input type="text" maxlength="40" autocomplete="off"></label><div class="exam-name-actions"><button type="button" data-action="cancel">取消</button><button type="button" class="primary" data-action="save">保存</button></div><div class="sheet-handle-zone sheet-handle-zone--bottom" aria-hidden="true"><div class="sheet-handle"></div></div></section>';
  elements.app.append(nameLayer);
  const nameTitle = nameLayer.querySelector('#examRenameTitle');
  const nameHint = nameLayer.querySelector('.exam-name-hint');
  const nameInput = nameLayer.querySelector('input');
  const nameSave = nameLayer.querySelector('[data-action="save"]');
  const namePanel = nameLayer.querySelector('.exam-name-panel');

  let returnFocus = null;
  let nameMode = null;
  let renameTarget = null;
  let nameReturnFocus = null;
  let listSheet;
  let nameSheet;
  const nameGhostGuard = createGhostClickGuard({
    owner: 'exams',
    appElement: elements.app,
    appClass: 'is-exam-name-ghost-guard',
    hitSelector: '#nav, .nav-btn, .topbar, #settingsButton, #moreButton, #topbarTitle, #gradeTable, .grade-score-cell, .grade-subject-head, .segment, .exam-sheet, .exam-item, .exam-select, .exam-add, .exam-action, .exam-name-sheet'
  });

  function notifyGradesUiChange() {
    onGradesUiChange?.();
  }

  function closeNameEditor({ restoreFocus = true } = {}) {
    if (!nameSheet?.isPresented() && !nameLayer.classList.contains('show')) return;
    if (!restoreFocus) nameReturnFocus = null;
    if (nameSheet?.isPresented()) nameSheet.closeInstant();
    else {
      nameLayer.classList.remove('show');
      nameLayer.inert = true;
      viewport.unlockStudentGrid();
      if (!listSheet.isPresented()) {
        setActiveOverlay(null);
      }
      syncChromeInert();
      const focus = nameReturnFocus;
      nameMode = null;
      renameTarget = null;
      nameReturnFocus = null;
      if (restoreFocus) focusSilently(focus);
    }
  }

  function close() {
    if (!listSheet?.isPresented() && !layer.classList.contains('show')) return;
    closeNameEditor({ restoreFocus: false });
    if (listSheet?.isPresented()) listSheet.closeInstant();
    else {
      layer.classList.remove('show', 'is-revealing', 'is-settling');
      layer.inert = true;
      listPanel.style.transform = '';
      listPanel.style.visibility = '';
      setActiveOverlay(null);
      syncChromeInert();
      const focus = returnFocus;
      returnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function openNameEditor({ mode, exam = null, trigger }) {
    nameMode = mode;
    renameTarget = exam;
    nameReturnFocus = trigger;
    if (mode === 'rename') {
      nameTitle.textContent = '修改名称';
      nameHint.textContent = '新名称会同步显示在统计页顶栏。';
      nameSave.textContent = '保存';
      nameInput.value = exam.title;
    } else {
      nameTitle.textContent = '新增';
      nameHint.textContent = '创建后可在统计页顶栏切换。';
      nameSave.textContent = '添加';
      nameInput.value = '';
    }
    viewport.lockStudentGrid();
    nameSheet.openInstant();
    requestAnimationFrame(() => {
      nameInput.focus({ preventScroll: true });
      const coarse = globalThis.matchMedia?.('(pointer: coarse)')?.matches
        || globalThis.Capacitor?.isNativePlatform?.();
      if (mode === 'rename' && !coarse) nameInput.select();
    });
  }

  function saveNameEditor() {
    const value = nameInput.value.trim();
    if (nameMode === 'rename') {
      if (!renameTarget || !store.renameExam(renameTarget.id, value)) {
        showToast('请输入有效且不同的考试名称');
        return;
      }
      closeNameEditor();
      return;
    }
    if (!store.addExam(value)) {
      showToast('请输入有效考试名称');
      return;
    }
    closeNameEditor();
  }

  function selectExam(examId) {
    if (!Number.isSafeInteger(examId)) return;
    if (state.gradeExamId === examId) {
      close();
      return;
    }
    setGradeExamId(examId);
    renderTopbarTitle();
    notifyGradesUiChange();
    close();
  }

  function render() {
    const snapshot = store.getSnapshot();
    const total = snapshot.students.length;
    const activeExamId = resolveGradeExamId(snapshot);
    list.replaceChildren(...snapshot.exams.map((exam) => {
      const item = document.createElement('div');
      item.className = 'exam-item';
      const entered = store.getExamEnteredStudentCount(exam.id);
      item.innerHTML = `<button type="button" class="exam-select" aria-pressed="${exam.id === activeExamId}">${exam.title}<small>${entered}/${total} 已录入</small></button><button type="button" class="exam-action" data-action="rename" aria-label="改名"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l3 3" /></svg></button><button type="button" class="exam-action" data-action="delete" aria-label="删除" ${snapshot.exams.length <= 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg></button>`;
      item.querySelector('.exam-select').addEventListener('click', () => {
        selectExam(exam.id);
      });
      item.querySelector('[data-action="rename"]').addEventListener('click', (event) => {
        openNameEditor({ mode: 'rename', exam, trigger: event.currentTarget });
      });
      item.querySelector('[data-action="delete"]').addEventListener('click', (event) => {
        const target = exam;
        confirm?.({
          title: '删除考试',
          message: `将删除「${target.title}」及其全部成绩记录。`,
          returnFocus: event.currentTarget,
          action: () => {
            if (!store.deleteExam(target.id)) {
              showToast('至少保留一场考试');
              return;
            }
            if (state.gradeExamId === target.id) {
              setGradeExamId(null);
              notifyGradesUiChange();
            }
            renderTopbarTitle();
            showToast(`已删除考试「${target.title}」`);
          },
        });
      });
      return item;
    }));
    if (isCourseGradesView()) renderTopbarTitle();
  }

  bindImmediateAction(nameLayer.querySelector('[data-action="cancel"]'), () => closeNameEditor(), {
    armGhost: (ms) => nameGhostGuard.arm(ms),
    capturePointer: true,
    owner: 'exams'
  });
  bindImmediateAction(nameSave, () => saveNameEditor(), {
    armGhost: (ms) => nameGhostGuard.arm(ms),
    capturePointer: true,
    owner: 'exams'
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveNameEditor();
    }
  });

  layer.querySelector('[data-action="close"]').addEventListener('click', close);
  addButton.addEventListener('click', () => {
    openNameEditor({ mode: 'add', trigger: addButton });
  });

  listSheet = createSheetController({
    id: 'exams',
    layer,
    panel: listPanel,
    direction: 'from-top',
    scrollPorts: [list],
    isOpen: () => layer.classList.contains('show') && !listSheet?.isActive(),
    onRequestClose: close,
    onPrepare({ source } = {}) {
      closeOthers?.('exams');
      if (source === 'gesture') returnFocus = null;
      else returnFocus = returnFocus ?? elements.topbarTitle;
      render();
      setActiveOverlay('exams');
    },
    onOpened({ source } = {}) {
      setActiveOverlay('exams');
      if (source === 'control') {
        focusSilently(layer.querySelector('.exam-select'));
      }
    },
    onClosed() {
      setActiveOverlay(null);
      const focus = returnFocus;
      returnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  nameSheet = createSheetController({
    id: 'exam-name',
    layer: nameLayer,
    panel: namePanel,
    direction: 'from-top',
    scrollPorts: [namePanel],
    isOpen: () => nameLayer.classList.contains('show') && !nameSheet?.isActive(),
    onRequestClose: closeNameEditor,
    onPrepare() {
      nameLayer.inert = false;
      nameLayer.classList.add('show');
    },
    onOpened() {
      nameLayer.inert = false;
      nameLayer.classList.add('show');
    },
    onClosed() {
      nameLayer.classList.remove('show');
      nameLayer.inert = true;
      namePanel.style.transform = '';
      namePanel.style.visibility = '';
      viewport.unlockStudentGrid();
      if (!listSheet.isPresented()) {
        setActiveOverlay(null);
        syncChromeInert();
      }
      const focus = nameReturnFocus;
      nameMode = null;
      renameTarget = null;
      nameReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  function open({ returnFocus: focusEl } = {}) {
    if (listSheet.isOpen() || listSheet.isActive()) return;
    returnFocus = focusEl ?? elements.topbarTitle;
    render();
    listSheet.openInstant();
  }

  function openCreate({ returnFocus: focusEl } = {}) {
    closeOthers?.('exams');
    const focus = focusEl ?? elements.moreButton;
    if (!listSheet.isPresented()) {
      setActiveOverlay('exams');
      syncChromeInert();
    }
    openNameEditor({ mode: 'add', trigger: focus });
  }

  elements.topbarTitle.addEventListener('click', () => {
    if (!isCourseGradesView()) return;
    open({ returnFocus: elements.topbarTitle });
  });
  store.subscribe(render);
  if (isCourseGradesView()) renderTopbarTitle();

  function dismissBack() {
    if (nameSheet.isPresented()) {
      closeNameEditor();
      return true;
    }
    if (listSheet.isPresented()) {
      close();
      return true;
    }
    return false;
  }

  return {
    close,
    open,
    openCreate,
    reveal: listSheet,
    sheet: listSheet,
    nameSheet,
    render,
    dismissBack
  };
}
