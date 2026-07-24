export const SHEET_CLOSE_DISTANCE = 88;

/** Bind handle drag-to-close. direction: bottom sheets use `down`, top sheets use `up`. */
export function bindSheetHandleDrag({ handle, panel, direction, onClose }) {
  let dragging = false;
  let pointerId;
  let startY = 0;
  let offsetY = 0;

  function reset() {
    dragging = false;
    offsetY = 0;
    panel.classList.remove('dragging');
    panel.style.transform = '';
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    dragging = true;
    pointerId = event.pointerId;
    startY = event.clientY;
    offsetY = 0;
    panel.classList.add('dragging');
    handle.setPointerCapture?.(pointerId);
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const delta = event.clientY - startY;
    offsetY = direction === 'down' ? Math.max(0, delta) : Math.min(0, delta);
    panel.style.transform = `translateY(${offsetY}px)`;
    event.preventDefault();
  }, { passive: false });

  const endDrag = (event, cancelled = false) => {
    if (!dragging || (event.pointerId != null && event.pointerId !== pointerId)) return;
    dragging = false;
    panel.classList.remove('dragging');
    if (!cancelled && Math.abs(offsetY) > SHEET_CLOSE_DISTANCE) onClose();
    else panel.style.transform = '';
    if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
  };

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', (event) => endDrag(event, true));
  handle.addEventListener('lostpointercapture', (event) => {
    if (event.target === handle) endDrag(event, true);
  });

  return { reset };
}
