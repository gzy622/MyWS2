const IME_INSET_THRESHOLD = 80;

const IME_HOST_SELECTOR = [
  '.assignment-name-sheet',
  '.assignment-sheet',
  '.exam-name-sheet',
  '.exam-sheet',
  '.student-record-sheet',
  '.people-pick-sheet',
  '.people-edit-sheet',
  '.course-slot-sheet',
  '.course-period-sheet',
  '.course-subject-sheet',
  '.course-grade-sheet',
  '.course-highlight-sheet',
  '.roster-student-name-sheet',
  '.confirm-sheet',
  '.more-menu',
  '.menu-drawer',
  '.font-size-popover'
].join(',');

function isTextEntry(element) {
  if (!(element instanceof HTMLElement)) return false;
  if ('disabled' in element && element.disabled) return false;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly;
  if (element instanceof HTMLInputElement) {
    if (element.readOnly) return false;
    if ((element.inputMode || '').toLowerCase() === 'none') return false;
    const type = (element.type || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image', 'hidden'].includes(type);
  }
  return Boolean(element.isContentEditable);
}

/**
 * Shell keeps a stable layout height while a text field is focused.
 * Only the focused overlay (via --ime-inset-bottom) yields to the keyboard.
 */
export function resolveViewportMetrics(
  layoutHeight,
  visualViewport,
  baselineHeight = layoutHeight,
  { textEntryFocused = false } = {}
) {
  const vvHeight = visualViewport?.height ?? layoutHeight;
  const vvOffsetTop = Math.max(0, visualViewport?.offsetTop ?? 0);
  const nextBaseline = textEntryFocused ? Math.max(baselineHeight, layoutHeight) : layoutHeight;
  const imeInsetBottom = textEntryFocused
    ? Math.max(0, nextBaseline - vvOffsetTop - vvHeight, nextBaseline - layoutHeight)
    : 0;

  return {
    height: nextBaseline,
    visualHeight: vvHeight,
    offsetTop: textEntryFocused ? 0 : vvOffsetTop,
    imeInsetBottom,
    imeOpen: textEntryFocused && imeInsetBottom >= IME_INSET_THRESHOLD,
    baselineHeight: nextBaseline
  };
}

export function initViewport({ app, studentGrid }) {
  let frame;
  let unlockFrame;
  let baselineHeight = window.innerHeight;
  let imeHost = null;

  function clearImeHost() {
    if (!imeHost) return;
    imeHost.classList.remove('is-ime-host');
    imeHost = null;
  }

  function syncImeHost(target) {
    const next = isTextEntry(target) ? target.closest(IME_HOST_SELECTOR) : null;
    if (next === imeHost) return;
    clearImeHost();
    if (!next) return;
    imeHost = next;
    imeHost.classList.add('is-ime-host');
  }

  function apply() {
    frame = undefined;
    const focused = isTextEntry(document.activeElement);
    const metrics = resolveViewportMetrics(
      window.innerHeight,
      window.visualViewport,
      baselineHeight,
      { textEntryFocused: focused }
    );
    baselineHeight = metrics.baselineHeight;
    app.style.setProperty('--app-viewport-height', `${metrics.height}px`);
    app.style.setProperty('--visual-viewport-height', `${metrics.visualHeight}px`);
    app.style.setProperty('--app-viewport-offset-top', `${metrics.offsetTop}px`);
    app.style.setProperty('--ime-inset-bottom', `${metrics.imeInsetBottom}px`);
    app.classList.toggle('ime-open', metrics.imeOpen);
    if (focused) syncImeHost(document.activeElement);
    else clearImeHost();
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  }

  function lockStudentGrid() {
    const height = studentGrid.getBoundingClientRect().height;
    if (height > 0) studentGrid.style.setProperty('--student-grid-locked-height', `${height}px`);
  }

  function unlockStudentGrid() {
    cancelAnimationFrame(unlockFrame);
    unlockFrame = requestAnimationFrame(() => {
      unlockFrame = requestAnimationFrame(() => {
        studentGrid.style.removeProperty('--student-grid-locked-height');
      });
    });
  }

  function onFocusIn(event) {
    syncImeHost(event.target);
    schedule();
  }

  function onFocusOut() {
    requestAnimationFrame(() => {
      syncImeHost(document.activeElement);
      schedule();
    });
  }

  apply();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);

  return { lockStudentGrid, unlockStudentGrid };
}
