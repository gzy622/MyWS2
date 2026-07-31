/**
 * Pure gesture decision helpers for pointer ownership, activation, and click guards.
 * Keep this module free of DOM, timers, and Capacitor so node:test can exercise it.
 */

/** Move past this distance before an axis is locked for the pointer sequence. */
export const AXIS_LOCK_DISTANCE = 6;

/** Hypotenuse past this counts as a drag (not a tap) for release activation. */
export const TAP_MOVE_TOLERANCE = 10;

/** Suppress synthetic click after drag / sheet move / gesture-owned activation. */
export const CLICK_SUPPRESS_MS = 450;

/** IME Sheet actions run on pointerdown and ignore the following synthetic click. */
export const IME_ACTION_DEDUP_MS = 500;

/** Default ghost-click underlay guard after an IME-safe immediate action. */
export const GHOST_GUARD_MS = 500;

/**
 * @param {{ deltaX: number, deltaY: number, lockDistance?: number }} input
 * @returns {null | 'x' | 'y'}
 */
export function resolveAxisLock({ deltaX, deltaY, lockDistance = AXIS_LOCK_DISTANCE }) {
  const distance = Math.hypot(deltaX, deltaY);
  if (!(distance > lockDistance)) return null;
  // Tie-break favors x to match the live gesture router.
  return Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y';
}

/**
 * @param {{ deltaX: number, deltaY: number, tolerance?: number }} input
 */
export function isDragBeyondTap({ deltaX, deltaY, tolerance = TAP_MOVE_TOLERANCE }) {
  return Math.hypot(deltaX, deltaY) > tolerance;
}

/**
 * Decide what a pointer sequence should activate on release, and whether trailing
 * browser click must be suppressed.
 *
 * @param {{
 *   cancelled: boolean,
 *   wasGesture: boolean,
 *   sheetMoved: boolean,
 *   handledSheet: boolean,
 *   claim: 'sheet' | 'blocked' | null,
 *   hasSheetTapControl: boolean,
 *   hasPostSheetCloseControl: boolean,
 *   hasPostPageSwipeControl?: boolean
 * }} input
 */
export function resolvePointerRelease({
  cancelled,
  wasGesture,
  sheetMoved,
  handledSheet,
  claim,
  hasSheetTapControl,
  hasPostSheetCloseControl,
  hasPostPageSwipeControl = false
}) {
  const immediatePostSheet = !cancelled && !wasGesture && hasPostSheetCloseControl;
  const immediatePostPageSwipe = !cancelled && !wasGesture && hasPostPageSwipeControl;
  const immediateSheet = !cancelled && !wasGesture && !sheetMoved && claim === 'sheet' && hasSheetTapControl;

  let activationSource = null;
  if (immediateSheet) activationSource = 'sheet-tap';
  else if (immediatePostSheet) activationSource = 'post-sheet-close-tap';
  else if (immediatePostPageSwipe) activationSource = 'post-page-swipe-tap';

  const armClickSuppress = Boolean(
    wasGesture || handledSheet || sheetMoved || activationSource
  );

  let clearReason = 'pointerup';
  if (cancelled) clearReason = 'pointercancel';
  else if (activationSource) clearReason = `activate:${activationSource}`;
  else if (wasGesture) clearReason = 'drag';
  else if (sheetMoved) clearReason = 'sheet-moved';
  else if (handledSheet) clearReason = 'sheet-handled';

  return {
    activationSource,
    armClickSuppress,
    clearReason
  };
}

/**
 * Click-suppression guard state machine (no timers — callers supply `now`).
 * A new real pointerdown must clear residual protection immediately.
 */
export function createClickSuppressState() {
  return { armed: false, until: 0 };
}

export function armClickSuppressState(state, now, durationMs = CLICK_SUPPRESS_MS) {
  return {
    armed: true,
    until: now + durationMs
  };
}

export function clearClickSuppressState() {
  return createClickSuppressState();
}

/**
 * @param {{ armed: boolean, until: number }} state
 * @param {number} now
 * @param {'pointerdown' | 'click' | 'timeout' | 'keydown'} trigger
 */
export function resolveClickSuppressEvent(state, now, trigger) {
  if (!state.armed) {
    return { swallow: false, next: state, clearReason: null };
  }

  if (trigger === 'pointerdown' || trigger === 'keydown') {
    return {
      swallow: false,
      next: clearClickSuppressState(),
      clearReason: trigger === 'pointerdown' ? 'new-pointerdown' : 'keydown'
    };
  }

  if (trigger === 'timeout' || now >= state.until) {
    return {
      swallow: false,
      next: clearClickSuppressState(),
      clearReason: 'timeout'
    };
  }

  if (trigger === 'click') {
    return {
      swallow: true,
      next: clearClickSuppressState(),
      clearReason: 'swallowed-click'
    };
  }

  return { swallow: false, next: state, clearReason: null };
}

/**
 * Ghost underlay guard after IME immediate actions.
 * Swallow matching trailing clicks; a new pointerdown always clears without swallowing.
 */
export function createGhostGuardState() {
  return { armed: false, until: 0 };
}

export function armGhostGuardState(state, now, durationMs = GHOST_GUARD_MS) {
  return {
    armed: true,
    until: now + durationMs
  };
}

export function clearGhostGuardState() {
  return createGhostGuardState();
}

/**
 * @param {{ armed: boolean, until: number }} state
 * @param {number} now
 * @param {'pointerdown' | 'click' | 'timeout'} trigger
 * @param {boolean} hitMatches whether the click landed on a protected underlay target
 */
export function resolveGhostGuardEvent(state, now, trigger, hitMatches = false) {
  if (!state.armed) {
    return { swallow: false, next: state, clearReason: null };
  }

  if (trigger === 'pointerdown') {
    return {
      swallow: false,
      next: clearGhostGuardState(),
      clearReason: 'new-pointerdown'
    };
  }

  if (trigger === 'timeout' || now >= state.until) {
    return {
      swallow: false,
      next: clearGhostGuardState(),
      clearReason: 'timeout'
    };
  }

  if (trigger === 'click') {
    return {
      swallow: Boolean(hitMatches),
      next: clearGhostGuardState(),
      clearReason: hitMatches ? 'swallowed-ghost-click' : 'click-miss-cleared'
    };
  }

  return { swallow: false, next: state, clearReason: null };
}

/**
 * IME / Sheet action: run once on pointerdown; suppress the synthetic click that follows.
 *
 * @param {{ lastRanAt: number, now: number, dedupMs?: number, source: 'pointerdown' | 'click' }} input
 */
export function resolveImmediateAction({
  lastRanAt,
  now,
  dedupMs = IME_ACTION_DEDUP_MS,
  source
}) {
  if (source === 'pointerdown') {
    return {
      run: true,
      nextRanAt: now,
      suppressSyntheticClick: false,
      activationSource: 'ime-pointerdown'
    };
  }

  const withinDedup = Number.isFinite(lastRanAt) && now - lastRanAt < dedupMs;
  if (withinDedup) {
    return {
      run: false,
      nextRanAt: lastRanAt,
      suppressSyntheticClick: true,
      activationSource: null,
      clearReason: 'ime-click-dedup'
    };
  }

  return {
    run: true,
    nextRanAt: now,
    suppressSyntheticClick: false,
    activationSource: 'ime-click-fallback'
  };
}

/**
 * Grades / nested scroll: same gesture must not hand off at the edge.
 *
 * @param {{
 *   startAtEdge: boolean,
 *   scrolledAwayFromEdge: boolean,
 *   nowAtEdge: boolean
 * }} input
 */
export function canHandOffAtScrollEdge({
  startAtEdge,
  scrolledAwayFromEdge,
  nowAtEdge
}) {
  if (!nowAtEdge) return false;
  if (scrolledAwayFromEdge) return false;
  return Boolean(startAtEdge);
}

/**
 * Safe diagnostic fields only — never attach names, scores, or raw input.
 *
 * @param {{
 *   sessionId?: string,
 *   owner?: string,
 *   activationSource?: string | null,
 *   clearReason?: string | null,
 *   claim?: string | null,
 *   axis?: string | null,
 *   cancelled?: boolean,
 *   pointerType?: string
 * }} fields
 */
export function buildGestureDebugDetail(fields = {}) {
  const detail = {};
  if (fields.sessionId != null) detail.sessionId = String(fields.sessionId);
  if (fields.owner != null) detail.owner = String(fields.owner);
  if (fields.activationSource != null) detail.activationSource = String(fields.activationSource);
  if (fields.clearReason != null) detail.clearReason = String(fields.clearReason);
  if (fields.claim != null) detail.claim = String(fields.claim);
  if (fields.axis != null) detail.axis = String(fields.axis);
  if (fields.cancelled != null) detail.cancelled = Boolean(fields.cancelled);
  if (fields.pointerType != null) detail.pointerType = String(fields.pointerType);
  return detail;
}
