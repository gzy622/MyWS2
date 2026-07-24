import { elements } from './dom.js';
import { state, setSeatEditing } from './state.js';
import { SEAT_COLUMNS, SEAT_ROWS } from './roster-model.js';
import { SEAT_STAGE_HEIGHT, SEAT_STAGE_WIDTH } from './seat-geometry.js';
import { haptic, Haptic } from './haptics.js';

const MIN_SCALE = 0.18;
const MAX_SCALE = 2.5;
const LONG_PRESS_MS = 480;
const CARD_MOVE_DISTANCE = 9;
const HINT_DURATION = 1400;
const PAN_SAMPLE_WINDOW = 100;
const MAX_INERTIA_SPEED = 2.5;
const MIN_INERTIA_SPEED = 0.02;
const INERTIA_DECAY = 325;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const distance = (first, second) => Math.hypot(second.x - first.x, second.y - first.y);
const midpoint = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

export function initSeatCanvas({ store, showToast, openStudentRecord }) {
  const { seatViewport: viewport, seatStage: stage, seatHint: hint } = elements;
  const pointers = new Map();
  const transform = { x: 0, y: 0, scale: 1 };
  let gesture = null;
  let dropTarget = null;
  let initialized = false;
  let hintTimer;
  let inertiaFrame;
  let resizeFrame;
  let pendingResizeConstraint = false;

  function stopInertia() {
    if (inertiaFrame !== undefined) cancelAnimationFrame(inertiaFrame);
    inertiaFrame = undefined;
  }

  function constrain(nextX, nextY, scale = transform.scale) {
    const scaledWidth = SEAT_STAGE_WIDTH * scale;
    const scaledHeight = SEAT_STAGE_HEIGHT * scale;
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

  function hideHintSoon() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.add('is-hidden'), HINT_DURATION);
  }

  function reset() {
    if (!viewport.clientWidth || !viewport.clientHeight) return;
    stopInertia();
    const scale = clamp(
      Math.min(viewport.clientWidth / SEAT_STAGE_WIDTH, viewport.clientHeight / SEAT_STAGE_HEIGHT) * 0.94,
      MIN_SCALE,
      MAX_SCALE
    );
    apply(
      (viewport.clientWidth - SEAT_STAGE_WIDTH * scale) / 2,
      (viewport.clientHeight - SEAT_STAGE_HEIGHT * scale) / 2,
      scale
    );
    initialized = true;
    hint.classList.remove('is-hidden');
    hideHintSoon();
  }

  function clearDropTarget() {
    dropTarget?.classList.remove('is-drop-target');
    dropTarget = null;
  }

  function showDropTarget(seatIndex) {
    const target = elements.seatGrid.querySelector(`.seat-cell[data-seat-index="${seatIndex}"]`);
    if (target === dropTarget) return;
    clearDropTarget();
    dropTarget = target;
    dropTarget?.classList.add('is-drop-target');
  }

  function closestSeatToCard(card) {
    const cells = [...elements.seatGrid.querySelectorAll('.seat-cell')];
    const cardRect = card.getBoundingClientRect();
    const centreX = cardRect.left + cardRect.width / 2;
    const centreY = cardRect.top + cardRect.height / 2;
    let closestRow = 0;
    let rowDistance = Infinity;
    for (let row = 0; row < SEAT_ROWS; row += 1) {
      const rect = cells[row * SEAT_COLUMNS].getBoundingClientRect();
      const nextDistance = Math.abs(centreY - rect.top - rect.height / 2);
      if (nextDistance < rowDistance) {
        rowDistance = nextDistance;
        closestRow = row;
      }
    }
    let closestSeat = Number(card.dataset.seatIndex);
    let columnDistance = Infinity;
    for (let column = 0; column < SEAT_COLUMNS; column += 1) {
      const cell = cells[closestRow * SEAT_COLUMNS + column];
      const rect = cell.getBoundingClientRect();
      const nextDistance = Math.abs(centreX - rect.left - rect.width / 2);
      if (nextDistance < columnDistance) {
        columnDistance = nextDistance;
        closestSeat = Number(cell.dataset.seatIndex);
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
  }

  function beginPinch() {
    stopInertia();
    cancelCardInteraction();
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
    if (!target || !viewport.contains(target)) return;
    event.preventDefault();
    stopInertia();
    viewport.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    hint.classList.add('is-hidden');
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
      cardGesture.longPressTimer = setTimeout(() => {
        if (gesture !== cardGesture || cardGesture.moved) return;
        cardGesture.longPressed = true;
        card.classList.remove('is-pressing');
        haptic(Haptic.medium);
        openStudentRecord(cardGesture.studentId, card);
      }, LONG_PRESS_MS);
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
      gesture.moved = true;
      gesture.card.classList.add('is-dragging');
      showDropTarget(gesture.originalSeat);
    }
    if (!gesture.moved) return;
    gesture.card.style.transform = `translate3d(${deltaX / transform.scale}px, ${deltaY / transform.scale}px, 0)`;
    gesture.targetSeat = closestSeatToCard(gesture.card);
    showDropTarget(gesture.targetSeat);
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
      gesture = null;
      applyPendingResizeConstraint();
      if (cancelled || cardGesture.longPressed) return;
      if (cardGesture.moved) {
        if (store.moveStudentSeat(cardGesture.studentId, cardGesture.targetSeat)) showToast('座位已更新');
      } else {
        const wasCompleted = cardGesture.card.getAttribute('aria-pressed') === 'true';
        if (store.toggleCompletion(cardGesture.studentId)) {
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
    hint.classList.add('is-hidden');
  }

  function contextMenu(event) {
    const card = event.target instanceof Element ? event.target.closest('.seat-card') : null;
    if (!card) return;
    event.preventDefault();
    openStudentRecord(Number(card.dataset.studentId), card);
  }

  function pointerCancel(event) {
    finishPointer(event, true);
  }

  function setEditing(editing) {
    cancelCardInteraction();
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
    hint.textContent = state.seatEditing
      ? '编辑模式 · 拖动卡片换座 · 空白平移 · 双指缩放'
      : '查看模式 · 轻点登记 · 长按打分 · 拖动画布 · 双指缩放';
    for (const card of elements.seatGrid.querySelectorAll('.seat-card')) {
      const name = card.textContent.trim();
      const completed = card.getAttribute('aria-pressed') === 'true';
      card.setAttribute(
        'aria-label',
        `${name}，${completed ? '已完成' : '未记录'}。${state.seatEditing ? '拖动可调整座位。' : '轻点登记，长按打分。'}`
      );
    }
  }

  viewport.addEventListener('pointerdown', pointerDown);
  viewport.addEventListener('pointermove', pointerMove, { passive: false });
  viewport.addEventListener('pointerup', finishPointer);
  viewport.addEventListener('pointercancel', pointerCancel);
  viewport.addEventListener('lostpointercapture', pointerCancel);
  viewport.addEventListener('contextmenu', contextMenu);
  viewport.addEventListener('wheel', zoomWithWheel, { passive: false });

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
      clearTimeout(hintTimer);
      cancelCardInteraction();
      observer.disconnect();
      viewport.removeEventListener('pointerdown', pointerDown);
      viewport.removeEventListener('pointermove', pointerMove);
      viewport.removeEventListener('pointerup', finishPointer);
      viewport.removeEventListener('pointercancel', pointerCancel);
      viewport.removeEventListener('lostpointercapture', pointerCancel);
      viewport.removeEventListener('contextmenu', contextMenu);
      viewport.removeEventListener('wheel', zoomWithWheel);
      pointers.clear();
    }
  };
}
