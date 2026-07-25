import { elements } from './dom.js';
import { state, setActiveOverlay } from './state.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently } from './focus.js';

export function initAssignments({ store, showToast, viewport, closeOthers, confirm }) {
  const layer = document.createElement('div');
  layer.className = 'assignment-sheet';
  layer.inert = true;
  layer.innerHTML = '<section class="assignment-panel sheet-panel sheet-panel--top" role="dialog" aria-modal="true" aria-labelledby="assignmentTitle"><header class="sheet-head"><div class="sheet-title"><span>登记</span><h2 id="assignmentTitle">作业</h2></div><button type="button" class="sheet-close" data-action="close" aria-label="关闭">×</button></header><div class="assignment-list"></div><button class="assignment-add" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新增作业</button><div class="sheet-handle-zone sheet-handle-zone--bottom" aria-hidden="true"><div class="sheet-handle"></div></div></section>';
  elements.app.append(layer);

  const list = layer.querySelector('.assignment-list');
  const addButton = layer.querySelector('.assignment-add');
  const listPanel = layer.querySelector('.assignment-panel');
  const nameLayer = document.createElement('div');
  nameLayer.className = 'assignment-name-sheet';
  nameLayer.inert = true;
  nameLayer.innerHTML = '<section class="assignment-name-panel sheet-panel sheet-panel--top" role="dialog" aria-modal="true" aria-labelledby="assignmentRenameTitle"><div class="sheet-title"><span>作业</span><h2 id="assignmentRenameTitle">修改名称</h2></div><p class="assignment-name-hint">新名称会同步显示在登记页顶栏。</p><label class="assignment-name-field"><span>名称</span><input type="text" maxlength="40" autocomplete="off"></label><div class="assignment-name-actions"><button type="button" data-action="cancel">取消</button><button type="button" class="primary" data-action="save">保存</button></div><div class="sheet-handle-zone sheet-handle-zone--bottom" aria-hidden="true"><div class="sheet-handle"></div></div></section>';
  elements.app.append(nameLayer);
  const nameTitle = nameLayer.querySelector('#assignmentRenameTitle');
  const nameHint = nameLayer.querySelector('.assignment-name-hint');
  const nameInput = nameLayer.querySelector('input');
  const nameSave = nameLayer.querySelector('[data-action="save"]');
  const namePanel = nameLayer.querySelector('.assignment-name-panel');

  let returnFocus = null;
  let nameMode = null;
  let renameTarget = null;
  let nameReturnFocus = null;
  let listSheet;
  let nameSheet;

  function active() { return store.getCurrentAssignment(); }
  function title() {
    elements.topbarTitleLabel.textContent = active().name;
    elements.topbarTitle.classList.toggle('is-assignment', state.currentPage === 1);
    elements.topbarTitle.setAttribute('aria-label', `当前作业：${active().name}，点击管理作业`);
  }

  function setListScrimProgress(progress, mode = 'drag') {
    if (mode === 'clear' || (progress == null && mode !== 'settle')) {
      layer.classList.remove('is-revealing', 'is-settling', 'is-dragging');
      layer.style.removeProperty('--sheet-reveal-progress');
      return;
    }
    if (mode === 'settle') {
      if (!layer.classList.contains('is-settling')) {
        layer.classList.remove('is-revealing');
        layer.classList.add('is-settling');
      }
    } else if (!layer.classList.contains('is-revealing')) {
      layer.classList.add('is-revealing');
      layer.classList.remove('is-settling');
    }
    if (progress != null) {
      const token = (Math.round(progress * 1000) / 1000).toFixed(3);
      if (layer.style.getPropertyValue('--sheet-reveal-progress') !== token) {
        layer.style.setProperty('--sheet-reveal-progress', token);
      }
    }
  }

  function closeNameEditor({ restoreFocus = true } = {}) {
    if (!nameSheet?.isPresented() && !nameLayer.classList.contains('show')) return;
    if (!restoreFocus) nameReturnFocus = null;
    if (nameSheet?.isPresented()) nameSheet.closeInstant();
    else {
      nameLayer.classList.remove('show');
      nameLayer.inert = true;
      viewport.unlockStudentGrid();
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
      setListScrimProgress(null, 'clear');
      setActiveOverlay(null);
      const focus = returnFocus;
      returnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function openNameEditor({ mode, assignment = null, trigger }) {
    nameMode = mode;
    renameTarget = assignment;
    nameReturnFocus = trigger;
    if (mode === 'rename') {
      nameTitle.textContent = '修改名称';
      nameHint.textContent = '新名称会同步显示在登记页顶栏。';
      nameSave.textContent = '保存';
      nameInput.value = assignment.name;
    } else {
      nameTitle.textContent = '新增';
      nameHint.textContent = '创建后可在登记页顶栏切换。';
      nameSave.textContent = '添加';
      nameInput.value = '';
    }
    viewport.lockStudentGrid();
    nameSheet.openInstant();
    requestAnimationFrame(() => {
      nameInput.focus({ preventScroll: true });
      if (mode === 'rename') nameInput.select();
    });
  }

  function saveNameEditor() {
    const value = nameInput.value.trim();
    if (nameMode === 'rename') {
      if (!renameTarget || !store.renameAssignment(renameTarget.id, value)) {
        showToast('请输入有效且不同的作业名称');
        return;
      }
      closeNameEditor();
      return;
    }
    if (!store.addAssignment(value)) {
      showToast('请输入有效作业名称');
      return;
    }
    closeNameEditor();
  }

  function render() {
    const snapshot = store.getSnapshot();
    const total = snapshot.students.length;
    list.replaceChildren(...snapshot.assignments.map((assignment) => {
      const item = document.createElement('div');
      item.className = 'assignment-item';
      item.innerHTML = `<button type="button" class="assignment-select" aria-pressed="${assignment.id === snapshot.activeAssignmentId}">${assignment.name}<small>${store.getCompletedCount(assignment.id)}/${total} 已交</small></button><button type="button" class="assignment-action" data-action="rename" aria-label="改名"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l3 3" /></svg></button><button type="button" class="assignment-action" data-action="delete" aria-label="删除" ${snapshot.assignments.length <= 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg></button>`;
      item.querySelector('.assignment-select').addEventListener('click', () => {
        store.selectAssignment(assignment.id);
        close();
      });
      item.querySelector('[data-action="rename"]').addEventListener('click', (event) => {
        openNameEditor({ mode: 'rename', assignment, trigger: event.currentTarget });
      });
      item.querySelector('[data-action="delete"]').addEventListener('click', (event) => {
        const target = assignment;
        confirm?.({
          title: '删除作业',
          message: `将删除「${target.name}」及其提交与分数记录。`,
          returnFocus: event.currentTarget,
          action: () => {
            if (!store.deleteAssignment(target.id)) showToast('至少保留一个作业');
            else showToast(`已删除作业「${target.name}」`);
          },
        });
      });
      return item;
    }));
    title();
  }

  nameLayer.querySelector('[data-action="cancel"]').addEventListener('click', () => closeNameEditor());
  nameSave.addEventListener('click', saveNameEditor);
  nameLayer.addEventListener('click', (event) => {
    if (event.target === nameLayer && !nameSheet?.isActive()) closeNameEditor();
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveNameEditor();
    }
  });

  layer.querySelector('[data-action="close"]').addEventListener('click', close);
  layer.addEventListener('click', (event) => {
    if (event.target === layer && !listSheet?.isActive()) close();
  });
  addButton.addEventListener('click', () => {
    openNameEditor({ mode: 'add', trigger: addButton });
  });

  listSheet = createSheetController({
    id: 'assignments',
    layer,
    panel: listPanel,
    direction: 'from-top',
    scrollPorts: [list],
    isOpen: () => layer.classList.contains('show') && !listSheet?.isActive(),
    onPrepare({ source } = {}) {
      closeOthers?.('assignments');
      // Gesture opens must not adopt the topbar title as return focus (avoids focus ring).
      if (source === 'gesture') returnFocus = null;
      else returnFocus = returnFocus ?? elements.topbarTitle;
      render();
      setActiveOverlay('assignments');
    },
    onOpened({ source } = {}) {
      setActiveOverlay('assignments');
      setListScrimProgress(null, 'clear');
      if (source === 'control') {
        focusSilently(layer.querySelector('.assignment-select'));
      }
    },
    onClosed() {
      setActiveOverlay(null);
      const focus = returnFocus;
      returnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    },
    setScrimProgress: setListScrimProgress
  });

  nameSheet = createSheetController({
    id: 'assignment-name',
    layer: nameLayer,
    panel: namePanel,
    direction: 'from-top',
    scrollPorts: [namePanel],
    isOpen: () => nameLayer.classList.contains('show') && !nameSheet?.isActive(),
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

  elements.topbarTitle.addEventListener('click', () => {
    if (state.currentPage !== 1) return;
    open({ returnFocus: elements.topbarTitle });
  });
  store.subscribe(render);
  title();

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
    reveal: listSheet,
    sheet: listSheet,
    nameSheet,
    render,
    dismissBack
  };
}
