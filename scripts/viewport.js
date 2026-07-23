export function resolveViewportMetrics(innerHeight, visualViewport, previousInnerHeight = innerHeight) {
  const height = innerHeight !== previousInnerHeight
    ? innerHeight
    : (visualViewport?.height ?? innerHeight);
  return {
    height: Math.max(0, height),
    offsetTop: Math.max(0, visualViewport?.offsetTop ?? 0)
  };
}

export function initViewport({ app, studentGrid }) {
  let frame;
  let unlockFrame;
  let previousInnerHeight = window.innerHeight;

  function apply() {
    frame = undefined;
    const innerHeight = window.innerHeight;
    const metrics = resolveViewportMetrics(innerHeight, window.visualViewport, previousInnerHeight);
    previousInnerHeight = innerHeight;
    app.style.setProperty('--app-viewport-height', `${metrics.height}px`);
    app.style.setProperty('--app-viewport-offset-top', `${metrics.offsetTop}px`);
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

  apply();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);

  return { lockStudentGrid, unlockStudentGrid };
}
