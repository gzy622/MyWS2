import { elements } from './dom.js';
import { state, setActiveOverlay } from './state.js';

export function initAssignments({ store, showToast, viewport, closeOthers }) {
  const layer = document.createElement('div');
  layer.className = 'assignment-overlay';
  layer.inert = true;
  layer.innerHTML = '<section class="assignment-panel" role="dialog" aria-modal="true" aria-labelledby="assignmentTitle"><header><h2 id="assignmentTitle">作业</h2><button type="button" data-action="close">关闭</button></header><div class="assignment-list"></div><button class="assignment-add" type="button">新增作业</button></section>';
  elements.app.append(layer);

  const list = layer.querySelector('.assignment-list');
  const renameLayer = document.createElement('div');
  renameLayer.className = 'assignment-rename-overlay';
  renameLayer.inert = true;
  renameLayer.innerHTML = '<section class="assignment-rename-panel" role="dialog" aria-modal="true" aria-labelledby="assignmentRenameTitle"><h2 id="assignmentRenameTitle">修改作业名称</h2><p>新名称会同步显示在登记页顶栏。</p><label class="assignment-rename-field"><span>作业名称</span><input type="text" maxlength="40" autocomplete="off"></label><div class="assignment-rename-actions"><button type="button" data-action="cancel">取消</button><button type="button" class="primary" data-action="save">保存</button></div></section>';
  elements.app.append(renameLayer);
  const renameInput = renameLayer.querySelector('input');

  let returnFocus = null;
  let renameTarget = null;
  let renameReturnFocus = null;

  function active() { return store.getCurrentAssignment(); }
  function title() {
    elements.topbarTitle.textContent = active().name;
    elements.topbarTitle.setAttribute('aria-label', `当前作业：${active().name}，点击管理作业`);
  }

  function closeRename({ restoreFocus = true } = {}) {
    if (!renameLayer.classList.contains('show')) return;
    renameLayer.classList.remove('show');
    renameLayer.inert = true;
    viewport.unlockStudentGrid();
    if (restoreFocus) renameReturnFocus?.focus({ preventScroll: true });
    renameTarget = null;
    renameReturnFocus = null;
  }

  function close() {
    if (!layer.classList.contains('show')) return;
    closeRename({ restoreFocus: false });
    layer.classList.remove('show');
    layer.inert = true;
    setActiveOverlay(null);
    returnFocus?.focus({ preventScroll: true });
    returnFocus = null;
  }

  function openRename(assignment, trigger) {
    renameTarget = assignment;
    renameReturnFocus = trigger;
    renameInput.value = assignment.name;
    viewport.lockStudentGrid();
    renameLayer.inert = false;
    renameLayer.classList.add('show');
    requestAnimationFrame(() => {
      renameInput.focus({ preventScroll: true });
      renameInput.select();
    });
  }

  function saveRename() {
    const value = renameInput.value.trim();
    if (!renameTarget || !store.renameAssignment(renameTarget.id, value)) {
      showToast('请输入有效且不同的作业名称');
      return;
    }
    closeRename();
  }

  function promptName(label, value = '') {
    viewport.lockStudentGrid();
    try {
      const next = window.prompt(label, value);
      return next === null ? null : next.trim();
    } finally {
      viewport.unlockStudentGrid();
    }
  }

  function render() {
    const snapshot = store.getSnapshot();
    const total = snapshot.students.length;
    list.replaceChildren(...snapshot.assignments.map((assignment) => {
      const item = document.createElement('div');
      item.className = 'assignment-item';
      item.innerHTML = `<button type="button" class="assignment-select" aria-pressed="${assignment.id === snapshot.activeAssignmentId}">${assignment.name}<small>${store.getCompletedCount(assignment.id)}/${total} 已交</small></button><button type="button" data-action="rename">改名</button><button type="button" data-action="delete" ${snapshot.assignments.length <= 1 ? 'disabled' : ''}>删除</button>`;
      item.querySelector('.assignment-select').addEventListener('click', () => {
        store.selectAssignment(assignment.id);
        close();
      });
      item.querySelector('[data-action="rename"]').addEventListener('click', (event) => {
        openRename(assignment, event.currentTarget);
      });
      item.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if (window.confirm(`删除「${assignment.name}」及其记录？`)) {
          if (!store.deleteAssignment(assignment.id)) showToast('至少保留一个作业');
          else showToast(`已删除作业「${assignment.name}」`);
        }
      });
      return item;
    }));
    title();
  }

  renameLayer.querySelector('[data-action="cancel"]').addEventListener('click', () => closeRename());
  renameLayer.querySelector('[data-action="save"]').addEventListener('click', saveRename);
  renameLayer.addEventListener('click', (event) => {
    if (event.target === renameLayer) closeRename();
  });
  renameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveRename();
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeRename();
    }
  });

  layer.querySelector('[data-action="close"]').addEventListener('click', close);
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  layer.querySelector('.assignment-add').addEventListener('click', () => {
    const value = promptName('新增作业');
    if (value === null) return;
    if (!store.addAssignment(value)) showToast('请输入有效作业名称');
  });
  elements.topbarTitle.addEventListener('click', () => {
    if (state.currentPage !== 1) return;
    closeOthers?.('assignments');
    returnFocus = elements.topbarTitle;
    render();
    layer.inert = false;
    layer.classList.add('show');
    setActiveOverlay('assignments');
    layer.querySelector('.assignment-select')?.focus({ preventScroll: true });
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && renameLayer.classList.contains('show')) {
      event.stopPropagation();
      closeRename();
      return;
    }
    if (event.key === 'Escape' && layer.classList.contains('show')) close();
  });
  store.subscribe(render);
  title();
  return { close, render };
}
