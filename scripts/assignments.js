import { elements } from './dom.js';
import { state, setActiveOverlay } from './state.js';
import { bindSheetHandleDrag } from './sheet-drag.js';

export function initAssignments({ store, showToast, viewport, closeOthers, confirm }) {
  const layer = document.createElement('div');
  layer.className = 'assignment-sheet';
  layer.inert = true;
  layer.innerHTML = '<section class="assignment-panel sheet-panel sheet-panel--top" role="dialog" aria-modal="true" aria-labelledby="assignmentTitle"><header class="sheet-head"><div class="sheet-title"><span>作业管理</span><h2 id="assignmentTitle">作业</h2></div><button type="button" class="sheet-close" data-action="close" aria-label="关闭">×</button></header><div class="assignment-list"></div><button class="assignment-add" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新增作业</button><div class="sheet-handle-zone sheet-handle-zone--bottom" aria-hidden="true"><div class="sheet-handle"></div></div></section>';
  elements.app.append(layer);

  const list = layer.querySelector('.assignment-list');
  const addButton = layer.querySelector('.assignment-add');
  const listPanel = layer.querySelector('.assignment-panel');
  const listHandle = layer.querySelector('.sheet-handle-zone');
  const nameLayer = document.createElement('div');
  nameLayer.className = 'assignment-name-sheet';
  nameLayer.inert = true;
  nameLayer.innerHTML = '<section class="assignment-name-panel sheet-panel sheet-panel--top" role="dialog" aria-modal="true" aria-labelledby="assignmentRenameTitle"><div class="sheet-title"><span>作业名称</span><h2 id="assignmentRenameTitle">修改作业名称</h2></div><p class="assignment-name-hint">新名称会同步显示在登记页顶栏。</p><label class="assignment-name-field"><span>作业名称</span><input type="text" maxlength="40" autocomplete="off"></label><div class="assignment-name-actions"><button type="button" data-action="cancel">取消</button><button type="button" class="primary" data-action="save">保存</button></div><div class="sheet-handle-zone sheet-handle-zone--bottom" aria-hidden="true"><div class="sheet-handle"></div></div></section>';
  elements.app.append(nameLayer);
  const nameTitle = nameLayer.querySelector('#assignmentRenameTitle');
  const nameHint = nameLayer.querySelector('.assignment-name-hint');
  const nameInput = nameLayer.querySelector('input');
  const nameSave = nameLayer.querySelector('[data-action="save"]');
  const namePanel = nameLayer.querySelector('.assignment-name-panel');
  const nameHandle = nameLayer.querySelector('.sheet-handle-zone');

  let returnFocus = null;
  let nameMode = null;
  let renameTarget = null;
  let nameReturnFocus = null;
  let listDrag;
  let nameDrag;

  function active() { return store.getCurrentAssignment(); }
  function title() {
    elements.topbarTitleLabel.textContent = active().name;
    elements.topbarTitle.classList.toggle('is-assignment', state.currentPage === 1);
    elements.topbarTitle.setAttribute('aria-label', `当前作业：${active().name}，点击管理作业`);
  }

  function closeNameEditor({ restoreFocus = true } = {}) {
    if (!nameLayer.classList.contains('show')) return;
    nameDrag?.reset();
    nameLayer.classList.remove('show');
    nameLayer.inert = true;
    viewport.unlockStudentGrid();
    if (restoreFocus) nameReturnFocus?.focus({ preventScroll: true });
    nameMode = null;
    renameTarget = null;
    nameReturnFocus = null;
  }

  function close() {
    if (!layer.classList.contains('show')) return;
    closeNameEditor({ restoreFocus: false });
    listDrag?.reset();
    layer.classList.remove('show');
    layer.inert = true;
    setActiveOverlay(null);
    returnFocus?.focus({ preventScroll: true });
    returnFocus = null;
  }

  function openNameEditor({ mode, assignment = null, trigger }) {
    nameMode = mode;
    renameTarget = assignment;
    nameReturnFocus = trigger;
    if (mode === 'rename') {
      nameTitle.textContent = '修改作业名称';
      nameHint.textContent = '新名称会同步显示在登记页顶栏。';
      nameSave.textContent = '保存';
      nameInput.value = assignment.name;
    } else {
      nameTitle.textContent = '新增作业';
      nameHint.textContent = '创建后可在登记页顶栏切换。';
      nameSave.textContent = '添加';
      nameInput.value = '';
    }
    nameDrag?.reset();
    viewport.lockStudentGrid();
    nameLayer.inert = false;
    nameLayer.classList.add('show');
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
    if (event.target === nameLayer) closeNameEditor();
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveNameEditor();
    }
  });

  layer.querySelector('[data-action="close"]').addEventListener('click', close);
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  addButton.addEventListener('click', () => {
    openNameEditor({ mode: 'add', trigger: addButton });
  });
  listDrag = bindSheetHandleDrag({
    handle: listHandle,
    panel: listPanel,
    direction: 'up',
    onClose: close,
  });
  nameDrag = bindSheetHandleDrag({
    handle: nameHandle,
    panel: namePanel,
    direction: 'up',
    onClose: () => closeNameEditor(),
  });
  elements.topbarTitle.addEventListener('click', () => {
    if (state.currentPage !== 1) return;
    closeOthers?.('assignments');
    returnFocus = elements.topbarTitle;
    render();
    listDrag?.reset();
    layer.inert = false;
    layer.classList.add('show');
    setActiveOverlay('assignments');
    layer.querySelector('.assignment-select')?.focus({ preventScroll: true });
  });
  store.subscribe(render);
  title();

  function dismissBack() {
    if (nameLayer.classList.contains('show')) {
      closeNameEditor();
      return true;
    }
    if (layer.classList.contains('show')) {
      close();
      return true;
    }
    return false;
  }

  return { close, render, dismissBack };
}
