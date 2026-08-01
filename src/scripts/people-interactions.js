import { elements } from './dom.js';
import { setActiveOverlay } from './state.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently } from './focus.js';
import { haptic, Haptic } from './haptics.js';
import { PEOPLE_TEXT_MAX_LENGTH } from './roster-model.js';
import { bindImmediateAction, createGhostClickGuard } from './pointer-guards.js';

const MOVE_CANCEL_DISTANCE = 9;
const LONG_PRESS_MS = 480;
const CLICK_SUPPRESSION_MS = 250;

export function initPeopleInteractions({ store, showToast, viewport, closeOthers, confirm }) {
  const pickLayer = document.createElement('div');
  pickLayer.className = 'people-pick-sheet';
  pickLayer.inert = true;
  pickLayer.innerHTML = [
    '<section class="people-pick-panel sheet-panel sheet-panel--bottom" role="dialog" aria-modal="true" aria-labelledby="peoplePickTitle" aria-describedby="peoplePickCount">',
    '<div class="sheet-handle-zone sheet-handle-zone--top" aria-hidden="true"><div class="sheet-handle"></div></div>',
    '<header class="sheet-head"><div class="sheet-title"><span data-field="eyebrow">班干</span><h2 id="peoplePickTitle">指派</h2>',
    '<p class="people-pick-count" id="peoplePickCount" data-field="count">未选择</p></div>',
    '<button type="button" class="sheet-close" data-action="close" aria-label="关闭">×</button></header>',
    '<div class="people-pick-list scroll-thin" role="listbox" aria-multiselectable="true"></div>',
    '<div class="people-pick-actions">',
    '<button type="button" data-action="clear">清除</button>',
    '<button type="button" class="primary" data-action="confirm">确认</button>',
    '</div>',
    '</section>'
  ].join('');
  elements.app.append(pickLayer);

  const editLayer = document.createElement('div');
  editLayer.className = 'people-edit-sheet';
  editLayer.inert = true;
  editLayer.innerHTML = [
    '<section class="people-edit-panel sheet-panel sheet-panel--top scroll-thin" role="dialog" aria-modal="true" aria-labelledby="peopleEditTitle">',
    '<div class="sheet-title"><span data-field="eyebrow">班干</span><h2 id="peopleEditTitle">编辑</h2></div>',
    '<p class="people-edit-hint"></p>',
    '<label class="people-edit-field"><span data-field="title-label">名称</span>',
    `<input type="text" data-field="title" maxlength="${PEOPLE_TEXT_MAX_LENGTH}" autocomplete="off"></label>`,
    '<label class="people-edit-field people-edit-note-field"><span>任务说明</span>',
    `<input type="text" data-field="note" maxlength="${PEOPLE_TEXT_MAX_LENGTH}" autocomplete="off"></label>`,
    '<div class="people-edit-actions">',
    '<button type="button" data-action="cancel">取消</button>',
    '<button type="button" class="primary" data-action="save">保存</button>',
    '</div>',
    '<button type="button" class="people-edit-delete" data-action="delete">删除此项</button>',
    '<div class="sheet-handle-zone sheet-handle-zone--bottom" aria-hidden="true"><div class="sheet-handle"></div></div>',
    '</section>'
  ].join('');
  elements.app.append(editLayer);

  const pickPanel = pickLayer.querySelector('.people-pick-panel');
  const pickList = pickLayer.querySelector('.people-pick-list');
  const pickEyebrow = pickLayer.querySelector('[data-field="eyebrow"]');
  const pickTitle = pickLayer.querySelector('#peoplePickTitle');
  const pickCount = pickLayer.querySelector('[data-field="count"]');
  const pickClear = pickLayer.querySelector('[data-action="clear"]');
  const pickConfirm = pickLayer.querySelector('[data-action="confirm"]');
  const editPanel = editLayer.querySelector('.people-edit-panel');
  const editEyebrow = editLayer.querySelector('[data-field="eyebrow"]');
  const editTitle = editLayer.querySelector('#peopleEditTitle');
  const editHint = editLayer.querySelector('.people-edit-hint');
  const editTitleLabel = editLayer.querySelector('[data-field="title-label"]');
  const titleInput = editLayer.querySelector('[data-field="title"]');
  const noteField = editLayer.querySelector('.people-edit-note-field');
  const noteInput = editLayer.querySelector('[data-field="note"]');
  const deleteButton = editLayer.querySelector('[data-action="delete"]');

  let pickSheet;
  let editSheet;
  let pickTarget = null;
  let pickReturnFocus = null;
  /** Draft selection while pick sheet is open; committed only on confirm. */
  let pickDraftIds = [];
  let editTarget = null;
  let editReturnFocus = null;
  const presses = new Map();
  let suppressClickUntil = 0;
  const editGhostGuard = createGhostClickGuard({
    owner: 'people',
    hitSelector: '#nav, .nav-btn, .segment, .confirm-sheet, .people-row, .people-edit-sheet',
    onArm: (until) => {
      suppressClickUntil = until;
    },
    onClear: () => {
      suppressClickUntil = 0;
    }
  });

  function closePick({ restoreFocus = true } = {}) {
    if (!pickSheet?.isPresented() && !pickLayer.classList.contains('show')) return;
    if (!restoreFocus) pickReturnFocus = null;
    if (pickSheet?.isPresented()) pickSheet.closeInstant();
    else {
      pickLayer.classList.remove('show');
      pickLayer.inert = true;
      setActiveOverlay(null);
      const focus = pickReturnFocus;
      pickTarget = null;
      pickDraftIds = [];
      pickReturnFocus = null;
      if (restoreFocus && focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function closeEdit({ restoreFocus = true } = {}) {
    if (!editSheet?.isPresented() && !editLayer.classList.contains('show')) return;
    if (!restoreFocus) editReturnFocus = null;
    if (editSheet?.isPresented()) editSheet.closeInstant();
    else {
      editLayer.classList.remove('show');
      editLayer.inert = true;
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = editReturnFocus;
      editTarget = null;
      editReturnFocus = null;
      if (restoreFocus && focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function selectedIdsForTarget(snapshot) {
    if (!pickTarget) return [];
    const item = pickTarget.kind === 'role'
      ? snapshot.roles.find((role) => role.id === pickTarget.id)
      : snapshot.duties.find((duty) => duty.id === pickTarget.id);
    return item?.studentIds ? [...item.studentIds] : [];
  }

  function updatePickCount(count) {
    pickCount.textContent = count > 0 ? `已选 ${count} 人` : '未选择';
  }

  function toggleDraftStudent(studentId) {
    const index = pickDraftIds.indexOf(studentId);
    if (index >= 0) pickDraftIds.splice(index, 1);
    else pickDraftIds.push(studentId);
  }

  function renderPickList() {
    if (!pickTarget) return;
    const snapshot = store.getSnapshot();
    const selectedSet = new Set(pickDraftIds);
    pickClear.disabled = pickDraftIds.length === 0;
    updatePickCount(pickDraftIds.length);
    pickList.replaceChildren(...snapshot.students.map((student) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'people-pick-option';
      option.setAttribute('role', 'option');
      option.dataset.studentId = String(student.id);
      const selected = selectedSet.has(student.id);
      option.setAttribute('aria-pressed', String(selected));
      option.textContent = student.name;
      if (selected) option.classList.add('is-selected');
      option.addEventListener('click', () => {
        if (!store.getSnapshot().students.some((entry) => entry.id === student.id)) {
          showToast('无法更新指派');
          return;
        }
        toggleDraftStudent(student.id);
        haptic(Haptic.light);
        renderPickList();
      });
      return option;
    }));
  }

  function confirmPick() {
    if (!pickTarget) return;
    const ok = pickTarget.kind === 'role'
      ? store.setRoleStudents(pickTarget.id, pickDraftIds)
      : store.setDutyStudents(pickTarget.id, pickDraftIds);
    if (!ok) {
      showToast('无法更新指派');
      return;
    }
    haptic(Haptic.medium);
    showToast(pickDraftIds.length > 0 ? `已指派 ${pickDraftIds.length} 人` : '已清除指派');
    closePick();
  }

  function openPick(kind, id, trigger) {
    const snapshot = store.getSnapshot();
    const item = kind === 'role'
      ? snapshot.roles.find((role) => role.id === id)
      : snapshot.duties.find((duty) => duty.id === id);
    if (!item) return;
    closeOthers?.('people-pick');
    pickTarget = { kind, id };
    pickReturnFocus = trigger;
    pickDraftIds = selectedIdsForTarget(snapshot);
    pickEyebrow.textContent = kind === 'role' ? '班干' : '值日';
    pickTitle.textContent = item.title;
    renderPickList();
    pickSheet.openInstant();
  }

  function openEdit(kind, id, trigger) {
    const snapshot = store.getSnapshot();
    const item = kind === 'role'
      ? snapshot.roles.find((role) => role.id === id)
      : snapshot.duties.find((duty) => duty.id === id);
    if (!item) return;
    closeOthers?.('people-edit');
    editTarget = { kind, id };
    editReturnFocus = trigger;
    const canDelete = kind === 'role' ? snapshot.roles.length > 1 : snapshot.duties.length > 1;
    deleteButton.disabled = !canDelete;
    editEyebrow.textContent = kind === 'role' ? '班干' : '值日';
    editTitle.textContent = item.title;
    editHint.textContent = '删除后不可恢复。';
    if (kind === 'role') {
      editTitleLabel.textContent = '职位名称';
      noteField.hidden = true;
      titleInput.value = item.title;
      noteInput.value = '';
    } else {
      editTitleLabel.textContent = '星期标题';
      noteField.hidden = false;
      titleInput.value = item.title;
      noteInput.value = item.note;
    }
    viewport?.lockStudentGrid?.();
    editSheet.openInstant();
    requestAnimationFrame(() => {
      titleInput.focus({ preventScroll: true });
      // select() breaks CJK IME composition on Android WebView / coarse pointers.
      const coarse = globalThis.matchMedia?.('(pointer: coarse)')?.matches
        || globalThis.Capacitor?.isNativePlatform?.();
      if (!coarse) titleInput.select();
    });
  }

  function saveEdit() {
    if (!editTarget) return;
    const title = titleInput.value.trim();
    if (editTarget.kind === 'role') {
      if (!store.renameRole(editTarget.id, title)) {
        showToast('请输入有效且不同的职位名称');
        return;
      }
      showToast('已更新职位名称');
      closeEdit();
      return;
    }
    if (!store.updateDuty(editTarget.id, { title, note: noteInput.value })) {
      showToast('请输入有效标题，或修改后再保存');
      return;
    }
    showToast('已更新值日');
    closeEdit();
  }

  function deleteCurrent() {
    if (!editTarget) return;
    const snapshot = store.getSnapshot();
    const item = editTarget.kind === 'role'
      ? snapshot.roles.find((role) => role.id === editTarget.id)
      : snapshot.duties.find((duty) => duty.id === editTarget.id);
    if (!item) return;
    const label = item.title;
    const kind = editTarget.kind;
    const id = editTarget.id;
    confirm?.({
      title: kind === 'role' ? '删除班干' : '删除值日',
      message: kind === 'role' ? `将删除职位「${label}」。` : `将删除值日「${label}」。`,
      returnFocus: editReturnFocus,
      action: () => {
        const ok = kind === 'role' ? store.deleteRole(id) : store.deleteDuty(id);
        if (!ok) showToast(kind === 'role' ? '至少保留一个班干职位' : '至少保留一个值日项');
        else showToast(`已删除「${label}」`);
      }
    });
    closeEdit({ restoreFocus: false });
  }

  pickSheet = createSheetController({
    id: 'people-pick',
    layer: pickLayer,
    panel: pickPanel,
    direction: 'from-bottom',
    scrollPorts: [pickList],
    isOpen: () => pickLayer.classList.contains('show') && !pickSheet?.isActive(),
    onRequestClose: closePick,
    onPrepare() {
      setActiveOverlay('people-pick');
      pickLayer.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('people-pick');
      pickLayer.inert = false;
      pickLayer.classList.add('show');
      focusSilently(pickList.querySelector('.people-pick-option.is-selected') || pickList.querySelector('.people-pick-option'));
    },
    onClosed() {
      pickLayer.classList.remove('show');
      pickLayer.inert = true;
      pickLayer.setAttribute('aria-hidden', 'true');
      setActiveOverlay(null);
      const focus = pickReturnFocus;
      pickTarget = null;
      pickDraftIds = [];
      pickReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  editSheet = createSheetController({
    id: 'people-edit',
    layer: editLayer,
    panel: editPanel,
    direction: 'from-top',
    scrollPorts: [editPanel],
    isOpen: () => editLayer.classList.contains('show') && !editSheet?.isActive(),
    onRequestClose: closeEdit,
    onPrepare() {
      setActiveOverlay('people-edit');
      editLayer.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('people-edit');
      editLayer.inert = false;
      editLayer.classList.add('show');
    },
    onClosed() {
      editLayer.classList.remove('show');
      editLayer.inert = true;
      editLayer.setAttribute('aria-hidden', 'true');
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = editReturnFocus;
      editTarget = null;
      editReturnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  function clearPress(pointerId) {
    const press = presses.get(pointerId);
    if (press) clearTimeout(press.timer);
    presses.delete(pointerId);
  }

  function bindList(list) {
    list.addEventListener('pointerdown', (event) => {
      const row = event.target.closest('.people-row');
      if (!row || !list.contains(row)) return;
      const press = {
        x: event.clientX,
        y: event.clientY,
        row,
        timer: null
      };
      press.timer = setTimeout(() => {
        if (!presses.has(event.pointerId)) return;
        clearPress(event.pointerId);
        suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
        haptic(Haptic.medium);
        openEdit(row.dataset.peopleKind, Number(row.dataset.peopleId), row);
      }, LONG_PRESS_MS);
      presses.set(event.pointerId, press);
    });
    list.addEventListener('pointermove', (event) => {
      const press = presses.get(event.pointerId);
      if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) <= MOVE_CANCEL_DISTANCE) return;
      clearPress(event.pointerId);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) {
      list.addEventListener(type, (event) => clearPress(event.pointerId));
    }
    list.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('.people-row');
      if (!row || !list.contains(row)) return;
      event.preventDefault();
      openEdit(row.dataset.peopleKind, Number(row.dataset.peopleId), row);
    });
    list.addEventListener('click', (event) => {
      const row = event.target.closest('.people-row');
      if (!row || !list.contains(row) || performance.now() < suppressClickUntil) return;
      openPick(row.dataset.peopleKind, Number(row.dataset.peopleId), row);
    });
  }

  bindList(elements.roleList);
  bindList(elements.dutyList);

  pickLayer.querySelector('[data-action="close"]').addEventListener('click', () => closePick());
  pickClear.addEventListener('click', () => {
    if (!pickTarget) return;
    if (pickDraftIds.length === 0) {
      showToast('当前没有指派');
      return;
    }
    pickDraftIds = [];
    haptic(Haptic.light);
    renderPickList();
  });
  pickConfirm.addEventListener('click', confirmPick);

  const armPeopleGhost = (ms) => editGhostGuard.arm(ms);
  bindImmediateAction(editLayer.querySelector('[data-action="cancel"]'), () => {
    closeEdit();
  }, { armGhost: armPeopleGhost, owner: 'people' });
  bindImmediateAction(editLayer.querySelector('[data-action="save"]'), () => {
    saveEdit();
  }, { armGhost: armPeopleGhost, owner: 'people' });
  bindImmediateAction(deleteButton, () => {
    deleteCurrent();
  }, { armGhost: armPeopleGhost, owner: 'people' });
  titleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!noteField.hidden) noteInput.focus({ preventScroll: true });
      else saveEdit();
    }
  });
  noteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEdit();
    }
  });

  function dismissBack() {
    if (editSheet.isPresented()) {
      closeEdit();
      return true;
    }
    if (pickSheet.isPresented()) {
      closePick();
      return true;
    }
    return false;
  }

  return {
    closePick,
    closeEdit,
    dismissBack,
    pickSheet,
    editSheet
  };
}
