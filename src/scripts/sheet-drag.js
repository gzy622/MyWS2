import { isSheetDebugEnabled, logSheetDebug } from './sheet-debug.js';

/** Minimum finger travel (px) before a slow drag may dismiss an open sheet. */
export const SHEET_CLOSE_DISTANCE = 180;
/** Close travel must also clear this fraction of panel travel (slow drag). */
const CLOSE_TRAVEL_RATIO = 0.4;
const SHEET_REVEAL_EXTRA = 72;
const SETTLE_PROGRESS = 0.34;
const SETTLE_MS = 360;
/** Keep compositor hints through the settle fallback boundary, then release promptly. */
const COMPOSITOR_RELEASE_MS = SETTLE_MS + 48;
const SETTLE_DISTANCE = 58;
/** How far a release coast may project progress (px/ms * ms / travel). */
const SETTLE_COAST_MS = 180;
/** Flick toward open (px/ms) with a short open travel. */
const FLICK_OPEN_VELOCITY = 0.45;
const FLICK_MIN_OPEN_PX = 64;
/** Flick toward closed (px/ms) with a short close travel — quick dismiss. */
const FLICK_CLOSE_VELOCITY = 0.4;
const FLICK_MIN_CLOSE_PX = 36;

/** JS scroll-port coast after release (aligned with seat-canvas inertia). */
const MAX_SCROLL_INERTIA_SPEED = 2.5;
const MIN_SCROLL_INERTIA_SPEED = 0.02;
const SCROLL_INERTIA_DECAY = 325;

/** @type {WeakMap<Element, number>} */
const scrollInertiaFrames = new WeakMap();
/** Pending scrollTop targets coalesced to one write per frame. */
/** @type {WeakMap<Element, number>} */
const scrollPortMirror = new WeakMap();
/** @type {WeakMap<Element, number>} */
const scrollPortPaintRaf = new WeakMap();
/** Strong refs while a coast is running so WeakMap frames stay reachable. */
const scrollingPorts = new Set();
/** Ports with a coalesced scrollTop paint queued. */
const pendingScrollPorts = new Set();

function syncSheetGestureChrome() {
  const app = document.getElementById('app');
  if (!app) return;
  let active = false;
  for (const sheet of registry.values()) {
    if (sheet.isDragging() || sheet.isSettling()) {
      active = true;
      break;
    }
  }
  app.classList.toggle('is-sheet-gesturing', active);
}

function flushScrollPortPaint(port) {
  if (!port) return;
  const raf = scrollPortPaintRaf.get(port);
  if (raf) {
    cancelAnimationFrame(raf);
    scrollPortPaintRaf.delete(port);
  }
  pendingScrollPorts.delete(port);
  if (!scrollPortMirror.has(port)) return;
  const next = scrollPortMirror.get(port);
  scrollPortMirror.delete(port);
  if (port.scrollTop !== next) port.scrollTop = next;
}

function scheduleScrollPortPaint(port, next) {
  scrollPortMirror.set(port, next);
  pendingScrollPorts.add(port);
  if (scrollPortPaintRaf.has(port)) return;
  const raf = requestAnimationFrame(() => {
    scrollPortPaintRaf.delete(port);
    pendingScrollPorts.delete(port);
    if (!scrollPortMirror.has(port)) return;
    const target = scrollPortMirror.get(port);
    scrollPortMirror.delete(port);
    if (port.scrollTop !== target) port.scrollTop = target;
  });
  scrollPortPaintRaf.set(port, raf);
}

/** Top-most first; matches system-back dismiss order for vertical sheets. */
export const SHEET_STACK_ORDER = [
  'confirm',
  'course-highlight',
  'course-subject',
  'course-period',
  'course-slot',
  'course-grade',
  'people-edit',
  'people-pick',
  'assignment-name',
  'assignments',
  'student-record',
  'drawer'
];

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const registry = new Map();

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function measureTravel(panel) {
  return Math.max(panel.getBoundingClientRect().height + SHEET_REVEAL_EXTRA, 160);
}

/**
 * A real scrim lets drag frames update only its composited opacity. Updating an
 * inherited CSS variable on the overlay otherwise invalidates the entire Sheet
 * subtree on every pointer frame.
 */
function ensureManagedScrim(layer, panel) {
  if (!layer || !panel) return null;
  let scrim = [...layer.children].find((child) => child.classList.contains('sheet-scrim'));
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.className = 'sheet-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    if (panel.parentElement === layer) layer.insertBefore(scrim, panel);
    else layer.prepend(scrim);
  }
  layer.classList.add('sheet-has-managed-scrim');
  return scrim;
}

/**
 * Unified progress 0–1 sheet controller.
 * from-top: drag down opens; from-bottom: drag up opens.
 */
export function createSheetController({
  id,
  panel,
  layer = null,
  direction,
  useShowClass = true,
  scrollPorts = [],
  /** Ports that keep browser-native pan/momentum instead of JS scrub scroll. */
  nativeScrollPorts = [],
  /** Optional real scrim element (the drawer uses #scrim instead of a layer pseudo-element). */
  scrimElement = null,
  isOpen: isOpenFn = null,
  onPrepare,
  onOpened,
  onClosed,
  setScrimProgress
}) {
  const managedScrim = useShowClass && layer ? ensureManagedScrim(layer, panel) : null;
  let progress = 0;
  let travel = 0;
  let dragging = false;
  let settling = false;
  let dragOriginProgress = 0;
  let presented = false;
  let settleTimer = 0;
  let settleGeneration = 0;
  let settleOnEnd = null;
  let compositorHintTimer = 0;
  let dragRaf = 0;
  let paintedProgress = NaN;
  let paintedScrimToken = '';
  /** @type {'gesture' | 'control' | null} */
  let openSource = null;
  let hasAnnouncedOpen = false;

  function isOpen() {
    if (dragging || settling) return false;
    if (typeof isOpenFn === 'function') return Boolean(isOpenFn());
    if (useShowClass && layer) {
      return layer.classList.contains('show')
        && !layer.classList.contains('is-revealing')
        && !layer.classList.contains('is-settling');
    }
    return presented && progress >= 1;
  }

  function isPresented() {
    return presented || dragging || settling || (typeof isOpenFn === 'function' && isOpenFn());
  }

  function progressToken(value) {
    return (Math.round(value * 1000) / 1000).toFixed(3);
  }

  /**
   * Bind the scrim to a progress value before any forced reflow. Without this
   * the `.show` fallback (opacity: 1) can win for one style recalculation and
   * the scrim visibly jumps when a scrub starts.
   */
  function writeManagedScrimProgress(value) {
    if (!managedScrim) return false;
    const token = progressToken(value);
    if (paintedScrimToken !== token) {
      paintedScrimToken = token;
      managedScrim.style.opacity = token;
    }
    return true;
  }

  function pinScrimToProgress(value) {
    const p = clamp01(value);
    if (useShowClass && layer) {
      writeManagedScrimProgress(p);
      layer.classList.add('is-revealing');
      layer.classList.remove('is-settling');
      return;
    }
    setScrimProgress?.(p, 'drag');
  }

  function applyTransform(nextProgress) {
    const offset = direction === 'from-top'
      ? -travel * (1 - nextProgress)
      : travel * (1 - nextProgress);
    // translate3d keeps the panel on the compositor during scrub/settle.
    panel.style.transform = `translate3d(0, ${offset}px, 0)`;
  }

  function setDraggingClass(on) {
    panel.classList.toggle('dragging', on);
    if (useShowClass && layer) layer.classList.toggle('is-dragging', on);
  }

  function clearCompositorHints() {
    if (compositorHintTimer) {
      window.clearTimeout(compositorHintTimer);
      compositorHintTimer = 0;
    }
    panel.classList.remove('sheet-compositing');
    layer?.classList.remove('sheet-scrim-compositing');
    scrimElement?.classList.remove('sheet-scrim-compositing');
    syncSheetGestureChrome();
  }

  /** Promote only the active panel/scrim, then release the GPU layers after settling. */
  function promoteCompositorLayers({ autoRelease = true } = {}) {
    clearCompositorHints();
    panel.classList.add('sheet-compositing');
    layer?.classList.add('sheet-scrim-compositing');
    scrimElement?.classList.add('sheet-scrim-compositing');
    if (autoRelease) {
      compositorHintTimer = window.setTimeout(clearCompositorHints, COMPOSITOR_RELEASE_MS);
    }
  }

  function cancelDragRaf() {
    if (!dragRaf) return;
    cancelAnimationFrame(dragRaf);
    dragRaf = 0;
  }

  function paint(nextProgress, mode = 'drag') {
    const p = clamp01(nextProgress);
    progress = p;
    if (mode === 'drag' && Number.isFinite(paintedProgress) && Math.abs(paintedProgress - p) < 0.0008) {
      return;
    }
    paintedProgress = p;
    applyTransform(p);
    if (useShowClass && layer) {
      writeManagedScrimProgress(p);
      if (mode !== 'drag') setScrimProgress?.(p, mode);
    } else {
      setScrimProgress?.(p, mode);
    }
  }

  function apply(nextProgress, mode = 'drag') {
    progress = clamp01(nextProgress);
    if (mode === 'drag' && dragging) {
      if (!dragRaf) {
        dragRaf = requestAnimationFrame(() => {
          dragRaf = 0;
          paint(progress, 'drag');
        });
      }
      return;
    }
    cancelDragRaf();
    paint(progress, mode);
  }

  function flushDragPaint() {
    cancelDragRaf();
    paint(progress, dragging ? 'drag' : 'settle');
  }

  function ensureTravel({ force = false } = {}) {
    if (travel > 0 && !force && (dragging || settling)) return travel;
    // getBoundingClientRect is the only required layout read. Avoid a preceding
    // offsetHeight read, which used to force the same layout twice at drag start.
    travel = measureTravel(panel);
    return travel;
  }

  /** Read on-screen progress from computed transform (needed when interrupting settle). */
  function readVisualProgress() {
    ensureTravel();
    const transform = getComputedStyle(panel).transform;
    if (!transform || transform === 'none') {
      if (isOpen() || presented) return progress > 0 ? progress : 1;
      return 0;
    }
    const parts = transform.match(/-?\d+\.?\d*(?:e[-+]?\d+)?/gi);
    if (!parts || travel <= 0) return progress;
    const ty = transform.startsWith('matrix3d')
      ? Number(parts[13])
      : Number(parts[5]);
    if (!Number.isFinite(ty)) return progress;
    if (direction === 'from-top') return clamp01(1 + ty / travel);
    return clamp01(1 - ty / travel);
  }

  function invalidateSettle() {
    if (!settling && !settleTimer && !settleOnEnd) return;
    settleGeneration += 1;
    settling = false;
    if (settleTimer) {
      window.clearTimeout(settleTimer);
      settleTimer = 0;
    }
    if (settleOnEnd) {
      panel.removeEventListener('transitionend', settleOnEnd);
      settleOnEnd = null;
    }
  }

  /** Interrupt in-flight settle and freeze at the on-screen position. */
  function cancelSettleAnimation() {
    if (!settling && !settleTimer && !settleOnEnd) return;
    const visual = readVisualProgress();
    invalidateSettle();
    progress = visual;
    paintedProgress = NaN;
    paintedScrimToken = '';
    pinScrimToProgress(visual);
    paint(progress, 'drag');
  }

  function enterPresented(meta = { source: openSource ?? 'control' }) {
    if (presented) return;
    onPrepare?.(meta);
    presented = true;
    if (useShowClass && layer) {
      layer.classList.remove('is-settling');
      layer.classList.add('show');
      layer.inert = false;
    }
    panel.style.visibility = 'visible';
  }

  function announceOpened() {
    if (hasAnnouncedOpen) return;
    hasAnnouncedOpen = true;
    onOpened?.({ source: openSource ?? 'control' });
  }

  function leavePresented() {
    const closedSource = openSource;
    cancelDragRaf();
    for (const port of scrollPorts) stopScrollPortInertia(port);
    presented = false;
    progress = 0;
    openSource = null;
    hasAnnouncedOpen = false;
    if (useShowClass && layer) {
      layer.classList.remove('show', 'is-revealing', 'is-settling', 'is-dragging');
      layer.inert = true;
      if (managedScrim) managedScrim.style.removeProperty('opacity');
    }
    panel.style.transform = '';
    panel.style.visibility = '';
    setDraggingClass(false);
    paintedProgress = NaN;
    paintedScrimToken = '';
    setScrimProgress?.(null, 'clear');
    syncSheetGestureChrome();
    onClosed?.({ source: closedSource });
  }

  function beginDrag() {
    if (settling || settleTimer || settleOnEnd) cancelSettleAnimation();
    cancelDragRaf();

    const startingFromClosed = !(presented || isOpen() || hasAnnouncedOpen || progress > 0.02);

    if (startingFromClosed) {
      openSource = 'gesture';
      hasAnnouncedOpen = false;
      dragOriginProgress = 0;
      progress = 0;
    } else if (progress === 0 && isOpen()) {
      // Fully open with cleared inline transform.
      progress = 1;
      dragOriginProgress = 1;
    } else {
      dragOriginProgress = clamp01(progress);
      progress = dragOriginProgress;
    }

    // Pin before enterPresented / ensureTravel — both can force a reflow.
    pinScrimToProgress(progress);
    enterPresented({ source: openSource ?? (startingFromClosed ? 'gesture' : 'control') });
    // Measure once after prepare has populated the panel, then promote it. Keeping
    // these writes together avoids the previous extra synchronous layout flush.
    ensureTravel({ force: true });
    // A drag may last indefinitely; retain only this active sheet's layers until release.
    promoteCompositorLayers({ autoRelease: false });
    dragging = true;
    setDraggingClass(true);
    syncSheetGestureChrome();
    if (useShowClass && layer) {
      layer.classList.add('show', 'is-revealing');
      layer.classList.remove('is-settling');
      layer.inert = false;
    }
    panel.style.visibility = 'visible';
    paintedProgress = NaN;
    paintedScrimToken = '';
    paint(progress, 'drag');
    if (isSheetDebugEnabled()) {
      logSheetDebug({
        kind: 'begin',
        id,
        direction,
        dragOriginProgress,
        presented,
        isOpen: isOpen(),
        startingFromClosed,
        travel
      });
    }
    return progress;
  }

  function moveByDeltaY(deltaY) {
    if (!dragging) beginDrag();
    const openDelta = direction === 'from-top' ? deltaY : -deltaY;
    const next = dragOriginProgress + (travel > 0 ? openDelta / travel : 0);
    apply(next, 'drag');
    return progress;
  }

  function setProgress(nextProgress, mode = 'drag') {
    if (mode === 'drag') pinScrimToProgress(nextProgress);
    enterPresented();
    ensureTravel({ force: mode !== 'drag' });
    if (mode === 'drag') {
      dragging = true;
      setDraggingClass(true);
      if (useShowClass && layer) {
        layer.classList.add('is-revealing');
        layer.classList.remove('is-settling');
      }
    }
    apply(nextProgress, mode);
  }

  function decideSettle(nextProgress, openVelocity = 0) {
    const travelPx = Math.max(travel, 1);
    const openPx = nextProgress * travelPx;
    const closedPx = (1 - nextProgress) * travelPx;
    const projected = clamp01(nextProgress + (openVelocity * SETTLE_COAST_MS) / travelPx);
    const closeVelocity = -openVelocity;
    const projectedClosedPx = (1 - projected) * travelPx;
    const startedOpen = dragOriginProgress >= 0.85;
    const minClosePx = Math.max(SHEET_CLOSE_DISTANCE, travelPx * CLOSE_TRAVEL_RATIO);

    let shouldOpen = true;
    let reason = 'unknown';

    if (startedOpen) {
      if (closedPx >= minClosePx) {
        shouldOpen = false;
        reason = `drag-close closedPx>=minClose (${Math.round(closedPx)}>=${Math.round(minClosePx)})`;
      } else if (closeVelocity >= FLICK_CLOSE_VELOCITY && closedPx >= FLICK_MIN_CLOSE_PX) {
        // Quick short flick: velocity + inertia, not full travel.
        shouldOpen = false;
        reason = `flick-close closeV>=${FLICK_CLOSE_VELOCITY} & closedPx>=${FLICK_MIN_CLOSE_PX} (v=${closeVelocity.toFixed(2)} px=${Math.round(closedPx)})`;
      } else if (
        projectedClosedPx >= Math.min(minClosePx, SETTLE_DISTANCE * 2)
        && closeVelocity >= FLICK_CLOSE_VELOCITY * 0.65
        && closedPx >= FLICK_MIN_CLOSE_PX * 0.75
      ) {
        shouldOpen = false;
        reason = `flick-close-coast projClosed=${Math.round(projectedClosedPx)} closeV=${closeVelocity.toFixed(2)}`;
      } else {
        shouldOpen = true;
        reason = `bounce-open short closedPx=${Math.round(closedPx)} minClose=${Math.round(minClosePx)} closeV=${closeVelocity.toFixed(2)}`;
      }
    } else if (openVelocity >= FLICK_OPEN_VELOCITY && openPx >= FLICK_MIN_OPEN_PX) {
      shouldOpen = true;
      reason = `flick-open openV>=${FLICK_OPEN_VELOCITY} & openPx>=${FLICK_MIN_OPEN_PX}`;
    } else if (projected >= SETTLE_PROGRESS) {
      shouldOpen = true;
      reason = `open-projected>=${SETTLE_PROGRESS}`;
    } else if (openPx >= SETTLE_DISTANCE) {
      shouldOpen = true;
      reason = `open-distance openPx>=${SETTLE_DISTANCE}`;
    } else if (nextProgress >= SETTLE_PROGRESS) {
      shouldOpen = true;
      reason = `open-progress>=${SETTLE_PROGRESS}`;
    } else {
      shouldOpen = false;
      reason = 'cancel-open below thresholds';
    }

    return {
      shouldOpen,
      reason,
      travelPx,
      openPx,
      closedPx,
      projected,
      projectedClosedPx,
      closeVelocity,
      startedOpen,
      minClosePx
    };
  }

  function shouldSettleOpen(nextProgress, openVelocity = 0) {
    return decideSettle(nextProgress, openVelocity).shouldOpen;
  }

  function settle({ open }) {
    const shouldOpen = Boolean(open);
    const targetProgress = shouldOpen ? 1 : 0;
    const closedOffset = direction === 'from-top' ? -travel : travel;
    const generation = ++settleGeneration;

    flushDragPaint();
    // Keep the same compositor layers alive while drag hands off to CSS settle.
    promoteCompositorLayers();
    dragging = false;
    settling = true;
    setDraggingClass(false);

    if (useShowClass && layer) {
      layer.classList.add('is-settling');
      layer.classList.remove('is-revealing');
      if (managedScrim) writeManagedScrimProgress(progress);
    }
    setScrimProgress?.(progress, 'settle');
    syncSheetGestureChrome();

    let finished = false;
    const finish = () => {
      if (finished || generation !== settleGeneration) return;
      finished = true;
      if (settleOnEnd) {
        panel.removeEventListener('transitionend', settleOnEnd);
        settleOnEnd = null;
      }
      if (settleTimer) {
        window.clearTimeout(settleTimer);
        settleTimer = 0;
      }
      settling = false;
      clearCompositorHints();
      if (!shouldOpen) {
        progress = 0;
        leavePresented();
        return;
      }
      progress = 1;
      panel.style.transform = '';
      panel.style.visibility = '';
      if (useShowClass && layer) {
        layer.classList.remove('is-revealing', 'is-settling');
        if (managedScrim) managedScrim.style.removeProperty('opacity');
        layer.classList.add('show');
        layer.inert = false;
      }
      setScrimProgress?.(null, 'clear');
      syncSheetGestureChrome();
      announceOpened();
    };

    settleOnEnd = (event) => {
      if (event.target !== panel || event.propertyName !== 'transform') return;
      finish();
    };

    if (prefersReducedMotion()) {
      if (shouldOpen) {
        progress = 1;
        panel.style.transform = '';
      }
      finish();
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (finished || generation !== settleGeneration) return;
        panel.style.transform = shouldOpen
          ? 'translate3d(0, 0, 0)'
          : `translate3d(0, ${closedOffset}px, 0)`;
        if (useShowClass && layer && managedScrim) {
          writeManagedScrimProgress(targetProgress);
        }
        setScrimProgress?.(targetProgress, 'settle');
        // Keep JS progress at the release value until finish/interrupt so a new
        // drag can recover the on-screen position instead of snapping open.
      });
    });

    panel.addEventListener('transitionend', settleOnEnd);
    settleTimer = window.setTimeout(finish, SETTLE_MS);
  }

  function endDrag({ velocityY = 0, cancelled = false } = {}) {
    if (!dragging && !settling) return;
    if (!dragging) return;
    flushDragPaint();
    const openVelocity = direction === 'from-top' ? velocityY : -velocityY;
    const decision = decideSettle(progress, openVelocity);
    // pointercancel / lost capture: bounce if the gesture started open.
    let shouldOpen = decision.shouldOpen;
    let reason = decision.reason;
    if (cancelled) {
      shouldOpen = dragOriginProgress >= 0.5;
      reason = shouldOpen
        ? `cancel-bounce origin=${dragOriginProgress.toFixed(2)}`
        : `cancel-dismiss origin=${dragOriginProgress.toFixed(2)}`;
    }
    if (isSheetDebugEnabled()) {
      logSheetDebug({
        kind: 'end',
        id,
        direction,
        shouldOpen,
        cancelled,
        reason,
        progress,
        dragOriginProgress,
        startedOpen: decision.startedOpen,
        closedPx: decision.closedPx,
        minClosePx: decision.minClosePx,
        velocityY,
        openVelocity,
        closeVelocity: decision.closeVelocity,
        travel: decision.travelPx,
        projected: decision.projected,
        projectedClosedPx: decision.projectedClosedPx,
        openPx: decision.openPx
      });
    }
    settle({ open: shouldOpen });
    return shouldOpen;
  }

  function openInstant() {
    invalidateSettle();
    cancelDragRaf();
    dragging = false;
    openSource = 'control';
    // Add the compositor hint before the state change without forcing layout.
    promoteCompositorLayers();
    enterPresented({ source: 'control' });
    progress = 1;
    paintedProgress = NaN;
    paintedScrimToken = '';
    setDraggingClass(false);
    panel.style.transform = '';
    panel.style.visibility = '';
    if (useShowClass && layer) {
      layer.classList.add('show');
      layer.classList.remove('is-revealing', 'is-settling', 'is-dragging');
      if (managedScrim) managedScrim.style.removeProperty('opacity');
      layer.inert = false;
    }
    setScrimProgress?.(null, 'clear');
    syncSheetGestureChrome();
    announceOpened();
  }

  function closeInstant() {
    invalidateSettle();
    cancelDragRaf();
    dragging = false;
    if (!presented && !isOpenFn?.()) {
      clearCompositorHints();
      setDraggingClass(false);
      panel.style.transform = '';
      panel.style.visibility = '';
      setScrimProgress?.(null, 'clear');
      return;
    }
    promoteCompositorLayers();
    leavePresented();
  }

  function abort() {
    if (!dragging && !settling && !presented) return;
    invalidateSettle();
    cancelDragRaf();
    dragging = false;
    settling = false;
    clearCompositorHints();
    leavePresented();
  }

  const controller = {
    id,
    direction,
    panel,
    layer,
    getScrollPorts: () => scrollPorts.filter(Boolean),
    getNativeScrollPorts: () => nativeScrollPorts.filter(Boolean),
    beginDrag,
    moveByDeltaY,
    setProgress,
    endDrag,
    settle,
    shouldSettleOpen,
    openInstant,
    closeInstant,
    abort,
    isActive: () => dragging || settling,
    isDragging: () => dragging,
    isSettling: () => settling,
    isPresented,
    isOpen,
    getTravel: () => travel || measureTravel(panel),
    getProgress: () => progress,
    getDirection: () => direction
  };

  registry.set(id, controller);
  return controller;
}

export function getSheet(id) {
  return registry.get(id) ?? null;
}

export function getTopSheet() {
  for (const id of SHEET_STACK_ORDER) {
    const sheet = registry.get(id);
    if (sheet?.isPresented()) return sheet;
  }
  return null;
}

export function isAnySheetDragging() {
  for (const sheet of registry.values()) {
    if (sheet.isActive()) return true;
  }
  return false;
}

export function unregisterSheet(id) {
  registry.delete(id);
}

/**
 * Find a registered scroll port under the event target.
 */
export function findScrollPort(target, scrollPorts) {
  if (!(target instanceof Element)) return null;
  for (const port of scrollPorts) {
    if (port && (port === target || port.contains(target))) return port;
  }
  return null;
}

export function scrollPortCanScroll(port, deltaY) {
  if (!port) return false;
  const max = port.scrollHeight - port.clientHeight;
  if (max <= 1) return false;
  const top = scrollPortMirror.has(port) ? scrollPortMirror.get(port) : port.scrollTop;
  // Finger up (deltaY < 0) increases scrollTop; finger down decreases it.
  if (deltaY < 0) return top < max - 1;
  if (deltaY > 0) return top > 0;
  return false;
}

export function applyScrollPortDelta(port, deltaYFromStart, startScrollTop) {
  if (!port) return 0;
  const max = Math.max(0, port.scrollHeight - port.clientHeight);
  const next = Math.min(max, Math.max(0, startScrollTop - deltaYFromStart));
  const applied = startScrollTop - next;
  // Coalesce DOM scrollTop writes; mirror keeps edge-handoff checks accurate.
  scheduleScrollPortPaint(port, next);
  // Return unused delta in screen space (positive deltaY = finger moved down).
  return deltaYFromStart - applied;
}

/**
 * Stop coasting on one port, or every port when omitted.
 * @param {Element | null} [port]
 */
export function stopScrollPortInertia(port = null) {
  if (port) {
    const frame = scrollInertiaFrames.get(port);
    if (frame !== undefined) cancelAnimationFrame(frame);
    scrollInertiaFrames.delete(port);
    scrollingPorts.delete(port);
    flushScrollPortPaint(port);
    return;
  }
  for (const active of [...scrollingPorts]) stopScrollPortInertia(active);
  for (const pending of [...pendingScrollPorts]) flushScrollPortPaint(pending);
}

/**
 * Coast a JS scroll port after release. velocityY is finger velocity (px/ms);
 * positive = finger down. Hits edges hard (no sheet handoff from inertia).
 */
export function startScrollPortInertia(port, velocityY) {
  if (!port || prefersReducedMotion()) return;
  stopScrollPortInertia(port);
  // During scrub: scrollTop = start - deltaY ⇒ d(scrollTop)/dt = -velocityY.
  let velocity = Math.max(
    -MAX_SCROLL_INERTIA_SPEED,
    Math.min(MAX_SCROLL_INERTIA_SPEED, -velocityY)
  );
  if (Math.abs(velocity) < MIN_SCROLL_INERTIA_SPEED) return;

  let previousTime;
  const animate = (time) => {
    if (previousTime === undefined) {
      previousTime = time;
      const frame = requestAnimationFrame(animate);
      scrollInertiaFrames.set(port, frame);
      return;
    }
    const elapsedFrame = Math.min(time - previousTime, 32);
    previousTime = time;
    velocity *= Math.exp(-elapsedFrame / SCROLL_INERTIA_DECAY);
    const max = Math.max(0, port.scrollHeight - port.clientHeight);
    const intended = port.scrollTop + velocity * elapsedFrame;
    const next = Math.min(max, Math.max(0, intended));
    port.scrollTop = next;
    if (Math.abs(next - intended) > 0.01) velocity = 0;
    if (Math.abs(velocity) < MIN_SCROLL_INERTIA_SPEED) {
      scrollInertiaFrames.delete(port);
      scrollingPorts.delete(port);
      return;
    }
    const frame = requestAnimationFrame(animate);
    scrollInertiaFrames.set(port, frame);
  };

  scrollingPorts.add(port);
  const frame = requestAnimationFrame(animate);
  scrollInertiaFrames.set(port, frame);
}
