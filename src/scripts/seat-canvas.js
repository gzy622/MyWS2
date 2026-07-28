import { elements } from './dom.js';
import { state, setSeatEditing } from './state.js';
import { SEAT_COLUMNS, SEAT_ROWS } from './roster-model.js';
import {
  getAdjacentSeatIndex,
  SEAT_STAGE_HEIGHT,
  SEAT_STAGE_WIDTH,
  SEAT_VIEW_MIN_SCALE
} from './seat-geometry.js';
import { haptic, Haptic } from './haptics.js';
import { logLogicDebug } from './sheet-debug.js';

const MIN_SCALE = 0.18;
const MAX_SCALE = 2.5;
const LONG_PRESS_MS = 480;
const CARD_MOVE_DISTANCE = 9;
const PAN_SAMPLE_WINDOW = 100;
const MAX_INERTIA_SPEED = 2.5;
const MIN_INERTIA_SPEED = 0.02;
const INERTIA_DECAY = 325;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const distance = (first, second) => Math.hypot(second.x - first.x, second.y - first.y);
const midpoint = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

export function initSeatCanvas({ store, showToast, openStudentRecord }) {
  const {
    seatViewport: viewport,
    seatStage: stage,
    seatFitButton: fitButton,
    seatLandscapeButton: landscapeButton,
    seatModeBar: modeBar,
    seatEditStatus: editStatus,
    exitSeatEditButton: exitEditButton
  } = elements;
  const pointers = new Map();
  const transform = { x: 0, y: 0, scale: 1 };
  let gesture = null;
  let dropTarget = null;
  let seatCellCache = null;
  let initialized = false;
  let inertiaFrame;
  let resizeFrame;
  let pendingResizeConstraint = false;
  let keyboardSelection = null;

  function stopInertia() {
    if (inertiaFrame !== undefined) cancelAnimationFrame(inertiaFrame);
    inertiaFrame = undefined;
  }

  function getStageSize() {
    return state.seatEditing
      ? { width: SEAT_STAGE_WIDTH, height: SEAT_STAGE_HEIGHT }
      : { width: stage.offsetWidth, height: stage.offsetHeight };
  }

  function constrain(nextX, nextY, scale = transform.scale) {
    const { width, height } = getStageSize();
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    return {
      x: scaledWidth <= viewport.clientWidth
        ? (viewport.clientWidth - scaledWidth) / 2
        : clamp(nextX, viewport.clientWidth - scaledWidth, 0),
      y: scaledHeight <= viewport.clientHeight
        ? (viewport.clientHeight - scaledHeight) / 2
        : clamp(nextY, viewport.clientHeight - scaledHeight, 0)
    };
  }

  function apply(nextX = transform.x, nextY = transform.y, nextScale = transform.scale) {
    transform.scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const position = constrain(nextX, nextY, transform.scale);
    transform.x = position.x;
    transform.y = position.y;
    stage.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
  }

  function reset() {
    if (!viewport.clientWidth || !viewport.clientHeight) return;
    stopInertia();
    clearKeyboardSelection();
    const { width, height } = getStageSize();
    const fitScale = Math.min(viewport.clientWidth / width, viewport.clientHeight / height) * 0.96;
    const scale = clamp(
      state.seatEditing ? fitScale : Math.max(fitScale, SEAT_VIEW_MIN_SCALE),
      MIN_SCALE,
      MAX_SCALE
    );
    apply(
      (viewport.clientWidth - width * scale) / 2,
      (viewport.clientHeight - height * scale) / 2,
      scale
    );
    initialized = true;
  }

  function seatPosition(seatIndex) {
    return {
      row: Math.floor(seatIndex / SEAT_COLUMNS) + 1,
      column: seatIndex % SEAT_COLUMNS + 1
    };
  }

  function getMoveDetails(studentId, targetSeat) {
    const snapshot = store.getSnapshot();
    const occupantSeat = snapshot.seats.find((seat) => seat.seatIndex === targetSeat && seat.studentId !== studentId);
    const occupant = occupantSeat
      ? snapshot.students.find((student) => student.id === occupantSeat.studentId)
      : null;
    return { occupant, ...seatPosition(targetSeat) };
  }

  function setEditStatus(message = '编辑中 · 拖动学生调整') {
    editStatus.textContent = message;
  }

  function describeTarget(studentId, targetSeat) {
    const { occupant, row, column } = getMoveDetails(studentId, targetSeat);
    return occupant ? `将与${occupant.name}交换` : `移动到第${row}排第${column}列`;
  }

  function moveSuccessMessage(studentId, targetSeat) {
    const { occupant, row, column } = getMoveDetails(studentId, targetSeat);
    return occupant ? `已与${occupant.name}交换座位` : `已移动到第${row}排第${column}列`;
  }

  function syncCardAccessibility() {
    const snapshot = store.getSnapshot();
    const students = new Map(snapshot.students.map((student) => [student.id, student]));
    for (const card of elements.seatGrid.querySelectorAll('.seat-card')) {
      const studentId = Number(card.dataset.studentId);
      const seatIndex = Number(card.dataset.seatIndex);
      const student = students.get(studentId);
      if (!student) continue;
      const { row, column } = seatPosition(seatIndex);
      const completed = card.getAttribute('aria-pressed') === 'true';
      const score = store.getScore(studentId);
      const status = score === undefined ? (completed ? '已完成' : '未记录') : `已完成，${score} 分`;
      const action = state.seatEditing
        ? '编辑模式。拖动调整座位；键盘可用方向键选择目标，回车确认。'
        : '轻点登记，长按打分。';
      card.setAttribute('aria-label', `${student.name}，第 ${row} 排第 ${column} 列，${status}。${action}`);
      if (state.seatEditing) card.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape');
      else card.removeAttribute('aria-keyshortcuts');
    }
  }

  function clearDropTarget() {
    dropTarget?.classList.remove('is-drop-target');
    dropTarget = null;
  }

  function cacheSeatCells() {
    const cells = [...elements.seatGrid.querySelectorAll('.seat-cell')];
    seatCellCache = {
      cells,
      rects: cells.map((cell) => cell.getBoundingClientRect())
    };
  }

  function clearSeatCellCache() {
    seatCellCache = null;
  }

  function showDropTarget(seatIndex) {
    const target = seatCellCache?.cells[seatIndex]
      ?? elements.seatGrid.querySelector(`.seat-cell[data-seat-index="${seatIndex}"]`);
    if (target === dropTarget) return;
    clearDropTarget();
    dropTarget = target;
    dropTarget?.classList.add('is-drop-target');
  }

  function clearKeyboardSelection({ resetStatus = true } = {}) {
    keyboardSelection?.card.classList.remove('is-keyboard-source');
    keyboardSelection = null;
    clearDropTarget();
    if (resetStatus && state.seatEditing) setEditStatus();
  }

  function selectCardForKeyboard(card) {
    clearKeyboardSelection({ resetStatus: false });
    keyboardSelection = {
      card,
      studentId: Number(card.dataset.studentId),
      targetSeat: Number(card.dataset.seatIndex)
    };
    card.classList.add('is-keyboard-source');
    showDropTarget(keyboardSelection.targetSeat);
    setEditStatus(`已选择${card.textContent.trim()} · 方向键选位置`);
  }

  function moveKeyboardTarget(key) {
    if (!keyboardSelection) return;
    keyboardSelection.targetSeat = getAdjacentSeatIndex(keyboardSelection.targetSeat, key);
    showDropTarget(keyboardSelection.targetSeat);
    setEditStatus(describeTarget(keyboardSelection.studentId, keyboardSelection.targetSeat));
  }

  function commitKeyboardMove() {
    if (!keyboardSelection) return;
    const { studentId, targetSeat } = keyboardSelection;
    const message = moveSuccessMessage(studentId, targetSeat);
    clearKeyboardSelection({ resetStatus: false });
    if (store.moveStudentSeat(studentId, targetSeat)) {
      showToast(message);
      setEditStatus(message);
      requestAnimationFrame(() => {
        elements.seatGrid.querySelector(`.seat-card[data-student-id="${studentId}"]`)?.focus();
        apply();
      });
    }
  }

  function closestSeatToCard(card) {
    if (!seatCellCache) cacheSeatCells();
    const { cells, rects } = seatCellCache;
    const cardRect = card.getBoundingClientRect();
    const centreX = cardRect.left + cardRect.width / 2;
    const centreY = cardRect.top + cardRect.height / 2;
    let closestRow = 0;
    let rowDistance = Infinity;
    for (let row = 0; row < SEAT_ROWS; row += 1) {
      const rect = rects[row * SEAT_COLUMNS];
      const nextDistance = Math.abs(centreY - rect.top - rect.height / 2);
      if (nextDistance < rowDistance) {
        rowDistance = nextDistance;
        closestRow = row;
      }
    }
    let closestSeat = Number(card.dataset.seatIndex);
    let columnDistance = Infinity;
    for (let column = 0; column < SEAT_COLUMNS; column += 1) {
      const seatIndex = closestRow * SEAT_COLUMNS + column;
      const rect = rects[seatIndex];
      const nextDistance = Math.abs(centreX - rect.left - rect.width / 2);
      if (nextDistance < columnDistance) {
        columnDistance = nextDistance;
        closestSeat = Number(cells[seatIndex].dataset.seatIndex);
      }
    }
    return closestSeat;
  }

  function cancelCardInteraction() {
    if (gesture?.type !== 'card') return;
    clearTimeout(gesture.longPressTimer);
    gesture.card.classList.remove('is-pressing', 'is-dragging');
    gesture.card.style.transform = '';
    clearDropTarget();
    clearSeatCellCache();
  }

  function beginPinch() {
    stopInertia();
    cancelCardInteraction();
    clearKeyboardSelection();
    viewport.classList.remove('is-panning');
    const entries = [...pointers.entries()].slice(0, 2);
    const centre = midpoint(entries[0][1], entries[1][1]);
    const rect = viewport.getBoundingClientRect();
    const localX = centre.x - rect.left;
    const localY = centre.y - rect.top;
    gesture = {
      type: 'pinch', pointerIds: entries.map(([id]) => id),
      startDistance: Math.max(distance(entries[0][1], entries[1][1]), 1),
      startScale: transform.scale,
      anchorX: (localX - transform.x) / transform.scale,
      anchorY: (localY - transform.y) / transform.scale,
      viewportLeft: rect.left,
      viewportTop: rect.top
    };
  }

  function updatePinch() {
    if (gesture?.type !== 'pinch') return;
    const [first, second] = gesture.pointerIds.map((id) => pointers.get(id));
    if (!first || !second) return;
    const centre = midpoint(first, second);
    const localX = centre.x - gesture.viewportLeft;
    const localY = centre.y - gesture.viewportTop;
    const scale = clamp(
      gesture.startScale * distance(first, second) / gesture.startDistance,
      MIN_SCALE,
      MAX_SCALE
    );
    apply(localX - gesture.anchorX * scale, localY - gesture.anchorY * scale, scale);
  }

  function recordPanSample(pan, event) {
    pan.samples.push({ x: event.clientX, y: event.clientY, time: event.timeStamp });
    const cutoff = event.timeStamp - PAN_SAMPLE_WINDOW;
    while (pan.samples.length > 1 && pan.samples[0].time < cutoff) pan.samples.shift();
  }

  function startInertia(samples) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || samples.length < 2) return;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsed = last.time - first.time;
    if (elapsed <= 0) return;
    let velocityX = clamp((last.x - first.x) / elapsed, -MAX_INERTIA_SPEED, MAX_INERTIA_SPEED);
    let velocityY = clamp((last.y - first.y) / elapsed, -MAX_INERTIA_SPEED, MAX_INERTIA_SPEED);
    if (Math.hypot(velocityX, velocityY) < MIN_INERTIA_SPEED) return;
    let previousTime;
    const animate = (time) => {
      if (previousTime === undefined) {
        previousTime = time;
        inertiaFrame = requestAnimationFrame(animate);
        return;
      }
      const elapsedFrame = Math.min(time - previousTime, 32);
      previousTime = time;
      const decay = Math.exp(-elapsedFrame / INERTIA_DECAY);
      velocityX *= decay;
      velocityY *= decay;
      const intendedX = transform.x + velocityX * elapsedFrame;
      const intendedY = transform.y + velocityY * elapsedFrame;
      apply(intendedX, intendedY);
      if (Math.abs(transform.x - intendedX) > 0.01) velocityX = 0;
      if (Math.abs(transform.y - intendedY) > 0.01) velocityY = 0;
      if (Math.hypot(velocityX, velocityY) < MIN_INERTIA_SPEED) {
        inertiaFrame = undefined;
        return;
      }
      inertiaFrame = requestAnimationFrame(animate);
    };
    inertiaFrame = requestAnimationFrame(animate);
  }

  function pointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    // 命中整个座位视口（含舞台外留白），避免缩放后可操作区域只剩中间一小块舞台
    if (!target || !viewport.contains(target) || target.closest('.seat-view-controls')) return;
    event.preventDefault();
    stopInertia();
    viewport.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      beginPinch();
      return;
    }
    if (pointers.size !== 1) return;
    const card = stage.contains(target) ? target.closest('.seat-card') : null;
    if (card) {
      const cardGesture = {
        type: 'card', pointerId: event.pointerId, card, editable: state.seatEditing,
        studentId: Number(card.dataset.studentId), originalSeat: Number(card.dataset.seatIndex),
        targetSeat: Number(card.dataset.seatIndex), startX: event.clientX, startY: event.clientY,
        startTime: event.timeStamp, originX: transform.x, originY: transform.y,
        moved: false, longPressed: false, longPressTimer: undefined
      };
      card.classList.add('is-pressing');
      if (!cardGesture.editable) {
        cardGesture.longPressTimer = setTimeout(() => {
          if (gesture !== cardGesture || cardGesture.moved) return;
          cardGesture.longPressed = true;
          card.classList.remove('is-pressing');
          haptic(Haptic.medium);
          openStudentRecord(cardGesture.studentId, card);
        }, LONG_PRESS_MS);
      }
      gesture = cardGesture;
      return;
    }
    viewport.classList.add('is-panning');
    gesture = {
      type: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      originX: transform.x, originY: transform.y,
      samples: [{ x: event.clientX, y: event.clientY, time: event.timeStamp }]
    };
  }

  function pointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture?.type === 'pinch') {
      updatePinch();
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.type === 'pan') {
      apply(gesture.originX + deltaX, gesture.originY + deltaY);
      recordPanSample(gesture, event);
      return;
    }
    if (gesture.longPressed) return;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) > CARD_MOVE_DISTANCE) {
      clearTimeout(gesture.longPressTimer);
      gesture.card.classList.remove('is-pressing');
      if (!gesture.editable) {
        const cardGesture = gesture;
        viewport.classList.add('is-panning');
        gesture = {
          type: 'pan', pointerId: event.pointerId,
          startX: cardGesture.startX, startY: cardGesture.startY,
          originX: cardGesture.originX, originY: cardGesture.originY,
          samples: [{ x: cardGesture.startX, y: cardGesture.startY, time: cardGesture.startTime }]
        };
        apply(gesture.originX + deltaX, gesture.originY + deltaY);
        recordPanSample(gesture, event);
        return;
      }
      clearKeyboardSelection();
      gesture.moved = true;
      gesture.card.classList.add('is-dragging');
      cacheSeatCells();
      showDropTarget(gesture.originalSeat);
    }
    if (!gesture.moved) return;
    gesture.card.style.transform = `translate3d(${deltaX / transform.scale}px, ${deltaY / transform.scale}px, 0)`;
    gesture.targetSeat = closestSeatToCard(gesture.card);
    showDropTarget(gesture.targetSeat);
    setEditStatus(describeTarget(gesture.studentId, gesture.targetSeat));
  }

  function applyPendingResizeConstraint() {
    if (!pendingResizeConstraint || pointers.size) return;
    pendingResizeConstraint = false;
    apply();
  }

  function finishPointer(event, cancelled = false) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (gesture?.type === 'pinch') {
      if (gesture.pointerIds.includes(event.pointerId)) gesture = null;
      applyPendingResizeConstraint();
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    viewport.classList.remove('is-panning');
    if (gesture.type === 'card') {
      const cardGesture = gesture;
      clearTimeout(cardGesture.longPressTimer);
      cardGesture.card.classList.remove('is-pressing', 'is-dragging');
      cardGesture.card.style.transform = '';
      clearDropTarget();
      clearSeatCellCache();
      gesture = null;
      applyPendingResizeConstraint();
      if (cancelled) {
        if (state.seatEditing) setEditStatus();
        return;
      }
      if (cardGesture.longPressed) return;
      if (cardGesture.moved) {
        const message = moveSuccessMessage(cardGesture.studentId, cardGesture.targetSeat);
        if (store.moveStudentSeat(cardGesture.studentId, cardGesture.targetSeat)) {
          showToast(message);
          setEditStatus(message);
          requestAnimationFrame(() => apply());
        }
      } else if (state.seatEditing) {
        selectCardForKeyboard(cardGesture.card);
      } else {
        const wasCompleted = cardGesture.card.getAttribute('aria-pressed') === 'true';
        if (store.toggleCompletion(cardGesture.studentId)) {
          logLogicDebug('completion toggled', {
            source: 'seat-tap',
            assignmentId: store.getCurrentAssignment().id,
            studentId: cardGesture.studentId,
            fromCompleted: wasCompleted,
            toCompleted: !wasCompleted
          });
          haptic(Haptic.light);
          showToast(wasCompleted ? '已取消完成' : '已标记完成');
        }
      }
      return;
    }
    const pan = gesture;
    if (!cancelled) {
      apply(pan.originX + event.clientX - pan.startX, pan.originY + event.clientY - pan.startY);
      recordPanSample(pan, event);
      startInertia(pan.samples);
    }
    gesture = null;
    applyPendingResizeConstraint();
  }

  function zoomWithWheel(event) {
    event.preventDefault();
    stopInertia();
    const nextScale = clamp(transform.scale * Math.exp(-event.deltaY * 0.0015), MIN_SCALE, MAX_SCALE);
    const rect = viewport.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    apply(
      localX - ((localX - transform.x) / transform.scale) * nextScale,
      localY - ((localY - transform.y) / transform.scale) * nextScale,
      nextScale
    );
  }

  function contextMenu(event) {
    const card = event.target instanceof Element ? event.target.closest('.seat-card') : null;
    if (!card) return;
    event.preventDefault();
    if (!state.seatEditing) openStudentRecord(Number(card.dataset.studentId), card);
  }

  function keyboardClick(event) {
    if (event.detail !== 0) return;
    const card = event.target instanceof Element ? event.target.closest('.seat-card') : null;
    if (!card || !elements.seatGrid.contains(card)) return;
    if (state.seatEditing) {
      selectCardForKeyboard(card);
      return;
    }
    const studentId = Number(card.dataset.studentId);
    const wasCompleted = card.getAttribute('aria-pressed') === 'true';
    if (store.toggleCompletion(studentId)) {
      logLogicDebug('completion toggled', {
        source: 'seat-keyboard',
        assignmentId: store.getCurrentAssignment().id,
        studentId,
        fromCompleted: wasCompleted,
        toCompleted: !wasCompleted
      });
      haptic(Haptic.light);
      showToast(wasCompleted ? '已取消完成' : '已标记完成');
    }
  }

  function keyboardEdit(event) {
    if (!state.seatEditing) return;
    const card = event.target instanceof Element ? event.target.closest('.seat-card') : null;
    if (event.key === 'Escape' && keyboardSelection) {
      event.preventDefault();
      clearKeyboardSelection();
      return;
    }
    if (!card || !elements.seatGrid.contains(card)) return;
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      if (!keyboardSelection || keyboardSelection.studentId !== Number(card.dataset.studentId)) selectCardForKeyboard(card);
      moveKeyboardTarget(event.key);
      return;
    }
    if (event.key === 'Enter' && keyboardSelection) {
      event.preventDefault();
      const targetStudentId = Number(card.dataset.studentId);
      if (targetStudentId !== keyboardSelection.studentId) {
        keyboardSelection.targetSeat = Number(card.dataset.seatIndex);
      }
      commitKeyboardMove();
    }
  }

  function pointerCancel(event) {
    finishPointer(event, true);
  }

  function setEditing(editing) {
    cancelCardInteraction();
    clearKeyboardSelection({ resetStatus: false });
    for (const pointerId of pointers.keys()) {
      if (viewport.hasPointerCapture?.(pointerId)) viewport.releasePointerCapture(pointerId);
    }
    gesture = null;
    pointers.clear();
    viewport.classList.remove('is-panning');
    clearDropTarget();
    setSeatEditing(editing);
    stage.classList.toggle('is-edit-mode', state.seatEditing);
    stage.classList.toggle('is-view-mode', !state.seatEditing);
    modeBar.hidden = !state.seatEditing;
    landscapeButton.disabled = state.seatEditing;
    setEditStatus();
    syncCardAccessibility();
    reset();
  }

  function exitEditing() {
    setEditing(false);
    showToast('已退出座位编辑模式');
    fitButton.focus();
  }

  viewport.addEventListener('pointerdown', pointerDown);
  viewport.addEventListener('pointermove', pointerMove, { passive: false });
  viewport.addEventListener('pointerup', finishPointer);
  viewport.addEventListener('pointercancel', pointerCancel);
  viewport.addEventListener('lostpointercapture', pointerCancel);
  viewport.addEventListener('contextmenu', contextMenu);
  viewport.addEventListener('click', keyboardClick);
  viewport.addEventListener('keydown', keyboardEdit);
  viewport.addEventListener('wheel', zoomWithWheel, { passive: false });
  fitButton.addEventListener('click', reset);
  exitEditButton.addEventListener('click', exitEditing);

  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (!viewport.clientWidth || !viewport.clientHeight) return;
      if (!initialized) reset();
      else if (pointers.size) pendingResizeConstraint = true;
      else apply();
    });
  });
  observer.observe(viewport);
  setEditing(false);

  return {
    reset,
    getState: () => ({ ...transform }),
    setEditing,
    destroy() {
      stopInertia();
      cancelAnimationFrame(resizeFrame);
      cancelCardInteraction();
      clearKeyboardSelection({ resetStatus: false });
      observer.disconnect();
      viewport.removeEventListener('pointerdown', pointerDown);
      viewport.removeEventListener('pointermove', pointerMove);
      viewport.removeEventListener('pointerup', finishPointer);
      viewport.removeEventListener('pointercancel', pointerCancel);
      viewport.removeEventListener('lostpointercapture', pointerCancel);
      viewport.removeEventListener('contextmenu', contextMenu);
      viewport.removeEventListener('click', keyboardClick);
      viewport.removeEventListener('keydown', keyboardEdit);
      viewport.removeEventListener('wheel', zoomWithWheel);
      fitButton.removeEventListener('click', reset);
      exitEditButton.removeEventListener('click', exitEditing);
      pointers.clear();
    }
  };
}
