import { elements } from './dom.js';
import { state, setActiveOverlay, setRosterEditorOpen } from './state.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently, syncChromeInert } from './focus.js';
import { bindImmediateAction, createGhostClickGuard } from './pointer-guards.js';
import { SEAT_COUNT, STUDENT_NAME_MAX_LENGTH } from './roster-model.js';

const RENAME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l3 3" /></svg>';
const DELETE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>';
const ADD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>';
const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>';

export function initRosterEditor({ store, showToast, viewport, closeOthers, confirm }) {
  const layer = document.createElement('div');
  layer.className = 'roster-editor';
  layer.inert = true;
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = [
    '<section class="roster-editor-panel" role="dialog" aria-modal="true" aria-labelledby="rosterEditorTitle">',
    '<header class="roster-editor-head menu-drawer-head">',
    `<button type="button" class="roster-editor-back menu-drawer-back" data-action="back" aria-label="返回">${BACK_ICON}</button>`,
    '<div class="roster-editor-title"><h1 id="rosterEditorTitle">学生名单</h1>',
    '<p data-field="count">0 人</p></div>',
    '<span aria-hidden="true"></span>',
    '</header>',
    '<div class="roster-editor-list scroll-thin" role="list"></div>',
    `<button type="button" class="roster-editor-add">${ADD_ICON}新增学生</button>`,
    '</section>'
  ].join('');
  // Scrim sits above the still-open settings drawer (same --layer-modal level,
  // earlier in DOM) but below this layer; visibility follows the same .show class.
  const scrim = document.createElement('div');
  scrim.className = 'roster-editor-scrim fullscreen-scrim';
  scrim.setAttribute('aria-hidden', 'true');
  elements.app.append(scrim);
  elements.app.append(layer);

  const list = layer.querySelector('.roster-editor-list');
  const countLabel = layer.querySelector('[data-field="count"]');
  const addButton = layer.querySelector('.roster-editor-add');
  const backButton = layer.querySelector('[data-action="back"]');

  const nameLayer = document.createElement('div');
  nameLayer.className = 'roster-student-name-sheet';
  nameLayer.inert = true;
  nameLayer.innerHTML = [
    '<section class="roster-student-name-panel sheet-panel sheet-panel--top" role="dialog" aria-modal="true" aria-labelledby="rosterStudentNameTitle">',
    '<div class="sheet-title"><span>学生</span><h2 id="rosterStudentNameTitle">修改姓名</h2></div>',
    '<p class="roster-student-name-hint">姓名会同步到登记、人员与课程。</p>',
    `<label class="assignment-name-field"><span>姓名</span>`,
    `<input type="text" maxlength="${STUDENT_NAME_MAX_LENGTH}" autocomplete="off"></label>`,
    '<div class="assignment-name-actions">',
    '<button type="button" data-action="cancel">取消</button>',
    '<button type="button" class="primary" data-action="save">保存</button>',
    '</div>',
    '<div class="sheet-handle-zone sheet-handle-zone--bottom" aria-hidden="true"><div class="sheet-handle"></div></div>',
    '</section>'
  ].join('');
  elements.app.append(nameLayer);

  const nameTitle = nameLayer.querySelector('#rosterStudentNameTitle');
  const nameHint = nameLayer.querySelector('.roster-student-name-hint');
  const nameInput = nameLayer.querySelector('input');
  const nameSave = nameLayer.querySelector('[data-action="save"]');
  const namePanel = nameLayer.querySelector('.roster-student-name-panel');

  let nameMode = null;
  let renameTarget = null;
  let nameReturnFocus = null;
  let nameSheet;
  let closing = false;
  let editorReturnFocus = null;
  let preserveDrawer = false;

  const nameGhostGuard = createGhostClickGuard({
    owner: 'roster-editor',
    appElement: elements.app,
    appClass: 'is-roster-student-name-ghost-guard',
    hitSelector: [
      '#nav, .nav-btn, .topbar, #settingsButton, #moreButton, #topbarTitle',
      '#studentGrid, .student-card, #seatViewport, .seat-card, .letter-index',
      '.roster-editor, .roster-editor-item, .roster-editor-add, .roster-editor-back',
      '.roster-student-name-sheet'
    ].join(', ')
  });

  function isPresented() {
    return state.rosterEditorOpen || layer.classList.contains('show');
  }

  function syncChrome(open) {
    setRosterEditorOpen(open);
    layer.classList.toggle('show', open);
    scrim.classList.toggle('show', open);
    layer.setAttribute('aria-hidden', open ? 'false' : 'true');
    layer.inert = !open;
    if (state.drawerOpen) elements.menuDrawer.inert = open;
    if (open) setActiveOverlay('roster-editor');
    else if (state.activeOverlay === 'roster-editor') setActiveOverlay(null);
    syncChromeInert();
  }

  function closeNameEditor({ restoreFocus = true } = {}) {
    if (!nameSheet?.isPresented() && !nameLayer.classList.contains('show')) return;
    if (!restoreFocus) nameReturnFocus = null;
    if (nameSheet?.isPresented()) nameSheet.closeInstant();
    else {
      nameLayer.classList.remove('show');
      nameLayer.inert = true;
      viewport?.unlockStudentGrid?.();
      syncChromeInert();
      const focus = nameReturnFocus;
      nameMode = null;
      renameTarget = null;
      nameReturnFocus = null;
      if (restoreFocus) focusSilently(focus);
    }
  }

  function close() {
    if (!isPresented() && !layer.classList.contains('show')) return;
    closeNameEditor({ restoreFocus: false });
    closing = true;
    syncChrome(false);
    closing = false;
    const focus = editorReturnFocus;
    editorReturnFocus = null;
    preserveDrawer = false;
    if (focus?.isConnected) focusSilently(focus);
    else blurIfSheetChrome();
  }

  function openNameEditor({ mode, student = null, trigger }) {
    nameMode = mode;
    renameTarget = student;
    nameReturnFocus = trigger;
    if (mode === 'rename') {
      nameTitle.textContent = '修改姓名';
      nameHint.textContent = '姓名会同步到登记、人员与课程。';
      nameSave.textContent = '保存';
      nameInput.value = student.name;
    } else {
      nameTitle.textContent = '新增';
      nameHint.textContent = '新学生会加入名单并分配空闲座位。';
      nameSave.textContent = '添加';
      nameInput.value = '';
    }
    viewport?.lockStudentGrid?.();
    nameSheet.openInstant();
    requestAnimationFrame(() => {
      nameInput.focus({ preventScroll: true });
      const coarse = globalThis.matchMedia?.('(pointer: coarse)')?.matches
        || globalThis.Capacitor?.isNativePlatform?.();
      if (mode === 'rename' && !coarse) nameInput.select();
    });
  }

  function saveNameEditor() {
    const value = nameInput.value;
    if (nameMode === 'rename') {
      if (!renameTarget) return;
      if (!store.renameStudent(renameTarget.id, value)) {
        showToast?.('请输入有效姓名');
        return;
      }
      closeNameEditor();
      return;
    }
    if (store.getSnapshot().students.length >= SEAT_COUNT) {
      showToast?.('座位已满，无法继续新增');
      return;
    }
    if (!store.addStudent(value)) {
      showToast?.('请输入有效姓名');
      return;
    }
    closeNameEditor();
  }

  function render() {
    if (!isPresented() && !closing) return;
    const snapshot = store.getSnapshot();
    const total = snapshot.students.length;
    countLabel.textContent = `${total} 人`;
    addButton.disabled = total >= SEAT_COUNT;
    list.replaceChildren(...snapshot.students.map((student) => {
      const item = document.createElement('div');
      item.className = 'roster-editor-item';
      item.setAttribute('role', 'listitem');
      const name = document.createElement('span');
      name.className = 'roster-editor-name';
      name.textContent = student.name;
      const renameButton = document.createElement('button');
      renameButton.type = 'button';
      renameButton.className = 'assignment-action';
      renameButton.dataset.action = 'rename';
      renameButton.setAttribute('aria-label', '改名');
      renameButton.innerHTML = RENAME_ICON;
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'assignment-action';
      deleteButton.dataset.action = 'delete';
      deleteButton.setAttribute('aria-label', '删除');
      deleteButton.disabled = total <= 1;
      deleteButton.innerHTML = DELETE_ICON;
      renameButton.addEventListener('click', (event) => {
        openNameEditor({ mode: 'rename', student, trigger: event.currentTarget });
      });
      deleteButton.addEventListener('click', (event) => {
        const target = student;
        confirm?.({
          title: '删除学生',
          message: `将删除「${target.name}」及其作业记录、课程成绩与人员指派。`,
          returnFocus: event.currentTarget,
          preserveDrawer,
          action: () => {
            if (!store.deleteStudent(target.id)) showToast?.('至少保留一名学生');
            else showToast?.(`已删除「${target.name}」`);
          },
        });
      });
      item.append(name, renameButton, deleteButton);
      return item;
    }));
  }

  bindImmediateAction(nameLayer.querySelector('[data-action="cancel"]'), () => closeNameEditor(), {
    armGhost: (ms) => nameGhostGuard.arm(ms),
    capturePointer: true,
    owner: 'roster-editor'
  });
  bindImmediateAction(nameSave, () => saveNameEditor(), {
    armGhost: (ms) => nameGhostGuard.arm(ms),
    capturePointer: true,
    owner: 'roster-editor'
  });
  nameLayer.addEventListener('click', (event) => {
    if (event.target === nameLayer && !nameSheet?.isActive()) closeNameEditor();
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveNameEditor();
    }
  });

  backButton.addEventListener('click', () => close());
  addButton.addEventListener('click', () => {
    if (addButton.disabled) {
      showToast?.('座位已满，无法继续新增');
      return;
    }
    openNameEditor({ mode: 'add', trigger: addButton });
  });

  nameSheet = createSheetController({
    id: 'roster-student-name',
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
      viewport?.unlockStudentGrid?.();
      syncChromeInert();
      const focus = nameReturnFocus;
      nameMode = null;
      renameTarget = null;
      nameReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  function open({ preserveDrawer: keepDrawer = false, returnFocus = null } = {}) {
    if (isPresented()) return;
    preserveDrawer = keepDrawer;
    editorReturnFocus = returnFocus;
    closeOthers?.(keepDrawer ? ['roster-editor', 'drawer'] : 'roster-editor');
    syncChrome(true);
    render();
    focusSilently(backButton);
  }

  store.subscribe(() => {
    if (isPresented()) render();
  });

  function dismissBack() {
    if (nameSheet.isPresented()) {
      closeNameEditor();
      return true;
    }
    if (isPresented()) {
      close();
      return true;
    }
    return false;
  }

  return {
    open,
    close,
    dismissBack,
    nameSheet,
    render
  };
}
