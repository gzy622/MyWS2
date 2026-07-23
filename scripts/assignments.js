import { elements } from './dom.js';
import { state, setActiveOverlay } from './state.js';

export function initAssignments({ store, showToast, viewport, closeOthers }) {
  const layer = document.createElement('div');
  layer.className = 'assignment-overlay';
  layer.inert = true;
  layer.innerHTML = '<section class="assignment-panel" role="dialog" aria-modal="true" aria-label="作业管理"><header><strong>作业</strong><button type="button" data-action="close">关闭</button></header><div class="assignment-list"></div><button class="assignment-add" type="button">新增作业</button></section>';
  elements.app.append(layer);
  const list = layer.querySelector('.assignment-list');
  let returnFocus = null;
  function active() { return store.getCurrentAssignment(); }
  function title() { elements.topbarTitle.textContent = active().name; elements.topbarTitle.setAttribute('aria-label', `当前作业：${active().name}，点击管理作业`); }
  function close() { if (!layer.classList.contains('show')) return; layer.classList.remove('show'); layer.inert = true; setActiveOverlay(null); returnFocus?.focus({ preventScroll: true }); returnFocus = null; }
  function promptName(label, value = '') {
    viewport.lockStudentGrid();
    try {
      const next = window.prompt(label, value);
      return next === null ? null : next.trim();
    } finally {
      viewport.unlockStudentGrid();
    }
  }
  function render() { const snapshot = store.getSnapshot(); const total = snapshot.students.length; list.replaceChildren(...snapshot.assignments.map((assignment) => { const item = document.createElement('div'); item.className = 'assignment-item'; item.innerHTML = `<button type="button" class="assignment-select" aria-pressed="${assignment.id === snapshot.activeAssignmentId}">${assignment.name}<small>${store.getCompletedCount(assignment.id)}/${total} 已交</small></button><button type="button" data-action="rename">改名</button><button type="button" data-action="delete" ${snapshot.assignments.length <= 1 ? 'disabled' : ''}>删除</button>`; item.querySelector('.assignment-select').addEventListener('click', () => { store.selectAssignment(assignment.id); close(); }); item.querySelector('[data-action="rename"]').addEventListener('click', () => { const value = promptName('修改作业标题', assignment.name); if (value === null) return; if (!store.renameAssignment(assignment.id, value)) showToast('请输入有效且不同的作业名称'); }); item.querySelector('[data-action="delete"]').addEventListener('click', () => { if (window.confirm(`删除「${assignment.name}」及其记录？`)) { if (!store.deleteAssignment(assignment.id)) showToast('至少保留一个作业'); } }); return item; })); title(); }
  layer.querySelector('[data-action="close"]').addEventListener('click', close);
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  layer.querySelector('.assignment-add').addEventListener('click', () => { const value = promptName('新增作业'); if (value === null) return; if (!store.addAssignment(value)) showToast('请输入有效作业名称'); });
  elements.topbarTitle.addEventListener('click', () => { if (state.currentPage !== 1) return; closeOthers?.('assignments'); returnFocus = elements.topbarTitle; render(); layer.inert = false; layer.classList.add('show'); setActiveOverlay('assignments'); layer.querySelector('.assignment-select')?.focus(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && layer.classList.contains('show')) close(); });
  store.subscribe(render); title(); return { close, render };
}
