import { elements } from './dom.js';

const STAGE_WIDTH = 1482;
const STAGE_HEIGHT = 908;
const MIN_SCALE = 0.18;
const MAX_SCALE = 2.5;
const HINT_DURATION = 1400;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const distance = (first, second) => Math.hypot(second.x - first.x, second.y - first.y);
const midpoint = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

export function initSeatCanvas() {
  const { seatViewport: viewport, seatStage: stage, seatHint: hint } = elements;
  const pointers = new Map();
  const transform = { x: 0, y: 0, scale: 1 };
  let gesture = null;
  let initialized = false;
  let hintTimer;
  let resizeFrame;

  function constrain(nextX, nextY, scale = transform.scale) {
    const scaledWidth = STAGE_WIDTH * scale;
    const scaledHeight = STAGE_HEIGHT * scale;
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
    const scale = clamp(
      Math.min(viewport.clientWidth / STAGE_WIDTH, viewport.clientHeight / STAGE_HEIGHT) * 0.94,
      MIN_SCALE,
      MAX_SCALE
    );
    apply(
      (viewport.clientWidth - STAGE_WIDTH * scale) / 2,
      (viewport.clientHeight - STAGE_HEIGHT * scale) / 2,
      scale
    );
    initialized = true;
    hint.classList.remove('is-hidden');
    hideHintSoon();
  }

  function beginPinch() {
    const [first, second] = [...pointers.values()];
    const centre = midpoint(first, second);
    const rect = viewport.getBoundingClientRect();
    const localX = centre.x - rect.left;
    const localY = centre.y - rect.top;
    viewport.classList.remove('is-panning');
    gesture = {
      type: 'pinch',
      startDistance: Math.max(distance(first, second), 1),
      startScale: transform.scale,
      anchorX: (localX - transform.x) / transform.scale,
      anchorY: (localY - transform.y) / transform.scale,
      viewportLeft: rect.left,
      viewportTop: rect.top
    };
  }

  function pointerDown(event) {
    if (event.target.closest('.seat-card')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    viewport.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    hint.classList.add('is-hidden');

    if (pointers.size === 2) {
      beginPinch();
      return;
    }
    if (pointers.size !== 1) return;

    viewport.classList.add('is-panning');
    gesture = {
      type: 'pan', pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      originX: transform.x, originY: transform.y
    };
  }

  function pointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (gesture?.type === 'pinch' && pointers.size >= 2) {
      const [first, second] = [...pointers.values()];
      const centre = midpoint(first, second);
      const localX = centre.x - gesture.viewportLeft;
      const localY = centre.y - gesture.viewportTop;
      const scale = clamp(
        gesture.startScale * distance(first, second) / gesture.startDistance,
        MIN_SCALE,
        MAX_SCALE
      );
      apply(localX - gesture.anchorX * scale, localY - gesture.anchorY * scale, scale);
      return;
    }

    if (gesture?.type !== 'pan' || gesture.pointerId !== event.pointerId) return;
    apply(
      gesture.originX + event.clientX - gesture.startX,
      gesture.originY + event.clientY - gesture.startY
    );
  }

  function finishPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    viewport.classList.remove('is-panning');
    gesture = null;
    if (viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  }

  function zoomWithWheel(event) {
    event.preventDefault();
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

  viewport.addEventListener('pointerdown', pointerDown);
  viewport.addEventListener('pointermove', pointerMove, { passive: false });
  viewport.addEventListener('pointerup', finishPointer);
  viewport.addEventListener('pointercancel', finishPointer);
  viewport.addEventListener('lostpointercapture', finishPointer);
  viewport.addEventListener('wheel', zoomWithWheel, { passive: false });

  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (!viewport.clientWidth || !viewport.clientHeight) return;
      if (!initialized) reset();
      else if (!pointers.size) apply();
    });
  });
  observer.observe(viewport);
}
