/**
 * Shared IME-safe immediate actions and ghost-click underlay guards.
 * Decision timing comes from gesture-policy.js; this module owns DOM listeners/timers.
 */

import {
  GHOST_GUARD_MS,
  IME_ACTION_DEDUP_MS,
  resolveImmediateAction
} from './gesture-policy.js';
import { isSheetDebugEnabled, logGestureSession, nextGestureSessionId } from './sheet-debug.js';

/** @type {Set<{ clear: (reason?: string) => void }>} */
const activeGuards = new Set();

/**
 * Clear every armed ghost guard (background, orientation, teardown).
 * @param {string} [reason]
 */
export function clearAllGhostClickGuards(reason = 'clear-all') {
  for (const guard of [...activeGuards]) {
    guard.clear(reason);
  }
}

/**
 * @param {{
 *   owner: string,
 *   hitSelector: string,
 *   appClass?: string | null,
 *   appElement?: Element | null,
 *   durationMs?: number,
 *   onSwallow?: ((hit: Element) => void) | null,
 *   onArm?: ((until: number) => void) | null,
 *   onClear?: ((reason: string) => void) | null
 * }} options
 */
export function createGhostClickGuard(options) {
  const {
    owner,
    hitSelector,
    appClass = null,
    appElement = null,
    durationMs = GHOST_GUARD_MS,
    onSwallow = null,
    onArm = null,
    onClear = null
  } = options;

  let clickGuard = null;
  let pointerGuard = null;
  let timer = 0;
  let until = 0;
  let sessionId = '';

  function clear(reason = 'manual') {
    if (!clickGuard && !pointerGuard && !timer && !until) {
      activeGuards.delete(api);
      return;
    }
    if (clickGuard) document.removeEventListener('click', clickGuard, true);
    if (pointerGuard) document.removeEventListener('pointerdown', pointerGuard, true);
    if (timer) window.clearTimeout(timer);
    clickGuard = null;
    pointerGuard = null;
    timer = 0;
    until = 0;
    if (appClass && appElement) appElement.classList.remove(appClass);
    activeGuards.delete(api);
    if (isSheetDebugEnabled() && sessionId) {
      logGestureSession('ghost guard cleared', {
        sessionId,
        owner,
        clearReason: reason
      });
    }
    onClear?.(reason);
    sessionId = '';
  }

  function arm(ms = durationMs) {
    clear('rearm');
    sessionId = nextGestureSessionId();
    until = performance.now() + ms;
    if (appClass && appElement) appElement.classList.add(appClass);

    clickGuard = (event) => {
      const now = performance.now();
      if (now >= until) {
        clear('timeout');
        return;
      }
      const hit = event.target;
      const armedSession = sessionId;
      clear('click');
      if (!(hit instanceof Element)) return;
      if (!hit.closest(hitSelector)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onSwallow?.(hit);
      if (isSheetDebugEnabled()) {
        logGestureSession('ghost click swallowed', {
          sessionId: armedSession,
          owner,
          clearReason: 'swallowed-ghost-click'
        });
      }
    };

    pointerGuard = () => clear('new-pointerdown');
    document.addEventListener('click', clickGuard, true);
    document.addEventListener('pointerdown', pointerGuard, true);
    timer = window.setTimeout(() => clear('timeout'), ms);
    activeGuards.add(api);
    onArm?.(until);
    if (isSheetDebugEnabled()) {
      logGestureSession('ghost guard armed', {
        sessionId,
        owner,
        activationSource: 'ime-action'
      });
    }
    return until;
  }

  const api = {
    arm,
    clear,
    isArmed: () => until > performance.now()
  };
  return api;
}

/**
 * Run Sheet/IME actions on pointerdown once; suppress the synthetic click that follows.
 *
 * @param {HTMLElement | null | undefined} button
 * @param {(event: Event) => void} action
 * @param {{
 *   armGhost?: ((ms?: number) => void) | null,
 *   capturePointer?: boolean,
 *   owner?: string,
 *   onPointerDown?: ((event: Event) => void) | null,
 *   onClickDeduped?: ((event: Event, deltaMs: number) => void) | null,
 *   onClickFallback?: ((event: Event) => void) | null
 * }} [options]
 */
export function bindImmediateAction(button, action, options = {}) {
  if (!(button instanceof HTMLElement)) return;
  const {
    armGhost = null,
    capturePointer = false,
    owner = 'immediate-action',
    onPointerDown = null,
    onClickDeduped = null,
    onClickFallback = null
  } = options;

  let lastRanAt = 0;

  button.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    const decision = resolveImmediateAction({
      lastRanAt,
      now,
      source: 'pointerdown'
    });
    lastRanAt = decision.nextRanAt;
    if (capturePointer) {
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best-effort; underlay pointer-events guard still applies.
      }
    }
    armGhost?.(IME_ACTION_DEDUP_MS);
    onPointerDown?.(event);
    if (isSheetDebugEnabled()) {
      logGestureSession('immediate action', {
        sessionId: nextGestureSessionId(),
        owner,
        activationSource: decision.activationSource
      });
    }
    action(event);
  }, { capture: true });

  button.addEventListener('click', (event) => {
    const now = performance.now();
    const decision = resolveImmediateAction({
      lastRanAt,
      now,
      source: 'click'
    });
    if (!decision.run) {
      event.preventDefault();
      event.stopPropagation();
      onClickDeduped?.(event, now - lastRanAt);
      return;
    }
    lastRanAt = decision.nextRanAt;
    armGhost?.(IME_ACTION_DEDUP_MS);
    onClickFallback?.(event);
    action(event);
  });
}
