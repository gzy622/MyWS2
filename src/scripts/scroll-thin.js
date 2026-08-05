/**
 * Soft auto-hide scrollbar chrome for `.scroll-thin` Sheet lists and full-screen pages.
 *
 * Native `::-webkit-scrollbar*` cannot fade in WebView, so the thumb is a
 * custom overlay. It is mounted on the Sheet panel (or sticky inside a
 * self-scrolling panel) so it travels with the panel `transform` — never
 * `position: fixed` to the viewport.
 */

const SHEET_LAYER_SELECTOR = [
  '.assignment-sheet',
  '.exam-sheet',
  '.assignment-name-sheet',
  '.exam-name-sheet',
  '.roster-student-name-sheet',
  '.roster-editor',
  '.people-pick-sheet',
  '.people-edit-sheet'
].join(', ');

const PANEL_SELECTOR = [
  '.assignment-panel',
  '.exam-panel',
  '.assignment-name-panel',
  '.exam-name-panel',
  '.roster-student-name-panel',
  '.roster-editor-panel',
  '.people-pick-panel',
  '.people-edit-panel',
  '.menu-drawer-body',
  '.sheet-panel'
].join(', ');

function readMs(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * @param {HTMLElement} port
 * @param {Element | null} layer
 */
function isSheetPresented(port, layer) {
  if (!layer) return true;
  return layer.classList.contains('show');
}

/**
 * @param {HTMLElement} port
 * @param {HTMLElement} thumb
 * @param {HTMLElement | null} panel
 * @param {'panel' | 'sticky'} mode
 * @param {Element | null} layer
 */
function syncThumbGeometry(port, thumb, panel, mode, layer) {
  if (!isSheetPresented(port, layer)) return false;

  const { scrollTop, scrollHeight, clientHeight } = port;
  const overflow = scrollHeight - clientHeight;
  if (overflow <= 1 || clientHeight <= 0) return false;

  const inset = 10;
  const track = Math.max(0, clientHeight - inset * 2);
  const thumbHeight = Math.max(28, (clientHeight / scrollHeight) * track);
  const travel = Math.max(0, track - thumbHeight);
  const progress = scrollTop / overflow;
  const offset = inset + progress * travel;

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.width = '3px';

  if (mode === 'sticky' || !panel) {
    thumb.style.top = `${offset}px`;
    thumb.style.right = '2px';
    thumb.style.left = 'auto';
  } else {
    const panelRect = panel.getBoundingClientRect();
    const portRect = port.getBoundingClientRect();
    // Ratios cancel sheet translate; thumb stays glued to the list edge.
    const top = portRect.top - panelRect.top + offset;
    const right = panelRect.right - portRect.right + 2;
    thumb.style.top = `${top}px`;
    thumb.style.right = `${right}px`;
    thumb.style.left = 'auto';
  }

  thumb.classList.add('is-ready');
  return true;
}

/**
 * @param {Element} element
 */
export function bindScrollThin(element) {
  if (!(element instanceof HTMLElement)) return;
  if (element.dataset.scrollThinBound === '1') return;
  element.dataset.scrollThinBound = '1';

  const layer = element.closest(SHEET_LAYER_SELECTOR);
  const panel = element.closest(PANEL_SELECTOR);
  const mode = panel && panel !== element ? 'panel' : 'sticky';

  const thumb = document.createElement('div');
  thumb.className = 'scroll-thin-thumb';
  thumb.dataset.mode = mode;
  thumb.setAttribute('aria-hidden', 'true');

  if (mode === 'panel' && panel instanceof HTMLElement) {
    panel.append(thumb);
  } else {
    element.prepend(thumb);
  }

  let hideTimer = 0;
  let compositingTimer = 0;
  let hover = false;

  const clearHideTimer = () => {
    if (!hideTimer) return;
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  };

  /** Release the compositing hint after the fade-out completes (R7). */
  const scheduleCompositingRelease = () => {
    if (compositingTimer) window.clearTimeout(compositingTimer);
    compositingTimer = window.setTimeout(() => {
      compositingTimer = 0;
      thumb.classList.remove('is-compositing');
    }, readMs('--scrollbar-fade', 280));
  };

  const clearCompositingRelease = () => {
    if (!compositingTimer) return;
    window.clearTimeout(compositingTimer);
    compositingTimer = 0;
  };

  const dismissNow = () => {
    clearHideTimer();
    clearCompositingRelease();
    hover = false;
    thumb.classList.add('is-snap-hide');
    thumb.classList.remove('is-visible', 'is-ready', 'is-compositing');
    window.requestAnimationFrame(() => thumb.classList.remove('is-snap-hide'));
  };

  const show = () => {
    if (!syncThumbGeometry(element, thumb, panel instanceof HTMLElement ? panel : null, mode, layer)) {
      dismissNow();
      return;
    }
    clearCompositingRelease();
    thumb.classList.add('is-compositing');
    thumb.classList.remove('is-snap-hide');
    window.requestAnimationFrame(() => {
      if (!thumb.classList.contains('is-ready')) return;
      if (!isSheetPresented(element, layer)) {
        dismissNow();
        return;
      }
      thumb.classList.add('is-visible');
    });
    clearHideTimer();
    if (hover) return;
    hideTimer = window.setTimeout(() => {
      hideTimer = 0;
      thumb.classList.remove('is-visible');
      scheduleCompositingRelease();
    }, readMs('--scrollbar-hold', 1100));
  };

  element.addEventListener('scroll', show, { passive: true });

  if (globalThis.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches) {
    element.addEventListener('pointerenter', () => {
      hover = true;
      clearHideTimer();
      if (syncThumbGeometry(element, thumb, panel instanceof HTMLElement ? panel : null, mode, layer)) {
        clearCompositingRelease();
        thumb.classList.add('is-compositing');
        thumb.classList.remove('is-snap-hide');
        window.requestAnimationFrame(() => {
          if (isSheetPresented(element, layer)) thumb.classList.add('is-visible');
        });
      }
    });
    element.addEventListener('pointerleave', () => {
      hover = false;
      thumb.classList.remove('is-visible');
      scheduleCompositingRelease();
    });
  }

  // Only snap-hide when the Sheet fully leaves — keep thumb during drag/settle
  // so it rides the panel transform.
  if (layer && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => {
      if (!isSheetPresented(element, layer)) dismissNow();
    });
    observer.observe(layer, { attributes: true, attributeFilter: ['class'] });
  }

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      if (!isSheetPresented(element, layer)) {
        dismissNow();
        return;
      }
      if (thumb.classList.contains('is-visible') || hover) {
        syncThumbGeometry(element, thumb, panel instanceof HTMLElement ? panel : null, mode, layer);
      }
    })
    : null;
  resizeObserver?.observe(element);
}

/**
 * @param {ParentNode} [root]
 */
export function initScrollThinChrome(root = document) {
  root.querySelectorAll('.scroll-thin').forEach((el) => bindScrollThin(el));
}

/**
 * Snapshot dual-axis scroll under a grade/summary host so a `replaceChildren`
 * rebuild (e.g. column-header sort cycle) can restore the viewport.
 * @param {ParentNode | null | undefined} host
 * @returns {{ left: number, top: number } | null}
 */
export function readGradeScroll(host) {
  const scroller = host instanceof Element ? host.querySelector('.grade-scroll') : null;
  if (!(scroller instanceof HTMLElement)) return null;
  return { left: scroller.scrollLeft, top: scroller.scrollTop };
}

/**
 * @param {HTMLElement} scroller
 * @param {{ left: number, top: number } | null | undefined} scroll
 */
export function applyGradeScroll(scroller, scroll) {
  if (!(scroller instanceof HTMLElement) || !scroll) return;
  scroller.scrollLeft = scroll.left;
  scroller.scrollTop = scroll.top;
}

/**
 * Bind soft horizontal and vertical overflow indicators to the dual-axis grade
 * table. Thumbs live on the card rather than inside the scrolling matrix, so
 * sticky cells and content width remain unaffected.
 * @param {HTMLElement} element
 * @returns {() => void} cleanup
 */
export function bindGradeScrollChrome(element) {
  if (!(element instanceof HTMLElement)) return () => {};
  const host = element.parentElement;
  if (!(host instanceof HTMLElement)) return () => {};

  const horizontalThumb = document.createElement('div');
  horizontalThumb.className = 'grade-scrollbar-thumb grade-scrollbar-thumb--x';
  horizontalThumb.setAttribute('aria-hidden', 'true');
  const verticalThumb = document.createElement('div');
  verticalThumb.className = 'grade-scrollbar-thumb grade-scrollbar-thumb--y';
  verticalThumb.setAttribute('aria-hidden', 'true');
  host.append(horizontalThumb, verticalThumb);

  let hideTimer = 0;
  let showFrame = 0;
  let hover = false;

  const clearHideTimer = () => {
    if (!hideTimer) return;
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  };

  const syncThumb = (thumb, axis) => {
    const horizontal = axis === 'x';
    const clientSize = horizontal ? element.clientWidth : element.clientHeight;
    const scrollSize = horizontal ? element.scrollWidth : element.scrollHeight;
    const scrollPosition = horizontal ? element.scrollLeft : element.scrollTop;
    const overflow = scrollSize - clientSize;
    if (overflow <= 1 || clientSize <= 0) {
      thumb.classList.remove('is-ready', 'is-visible');
      return false;
    }

    const inset = 8;
    const track = Math.max(0, clientSize - inset * 2);
    const thumbSize = Math.max(28, (clientSize / scrollSize) * track);
    const travel = Math.max(0, track - thumbSize);
    const offset = inset + (scrollPosition / overflow) * travel;
    const hostRect = host.getBoundingClientRect();
    const portRect = element.getBoundingClientRect();

    if (horizontal) {
      thumb.style.left = `${portRect.left - hostRect.left + offset}px`;
      thumb.style.bottom = '3px';
      thumb.style.width = `${thumbSize}px`;
      thumb.style.height = '3px';
    } else {
      thumb.style.top = `${portRect.top - hostRect.top + offset}px`;
      thumb.style.right = `${hostRect.right - portRect.right + 2}px`;
      thumb.style.width = '3px';
      thumb.style.height = `${thumbSize}px`;
    }
    thumb.classList.add('is-ready');
    return true;
  };

  const syncGeometry = () => {
    const horizontalReady = syncThumb(horizontalThumb, 'x');
    const verticalReady = syncThumb(verticalThumb, 'y');
    return horizontalReady || verticalReady;
  };

  const show = () => {
    if (!syncGeometry()) return;
    if (showFrame) cancelAnimationFrame(showFrame);
    showFrame = requestAnimationFrame(() => {
      showFrame = 0;
      horizontalThumb.classList.toggle('is-visible', horizontalThumb.classList.contains('is-ready'));
      verticalThumb.classList.toggle('is-visible', verticalThumb.classList.contains('is-ready'));
    });
    clearHideTimer();
    if (hover) return;
    hideTimer = window.setTimeout(() => {
      hideTimer = 0;
      horizontalThumb.classList.remove('is-visible');
      verticalThumb.classList.remove('is-visible');
    }, readMs('--scrollbar-hold', 1100));
  };

  const supportsHover = globalThis.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches;
  const onPointerEnter = () => {
    hover = true;
    clearHideTimer();
    show();
  };
  const onPointerLeave = () => {
    hover = false;
    horizontalThumb.classList.remove('is-visible');
    verticalThumb.classList.remove('is-visible');
  };

  element.addEventListener('scroll', show, { passive: true });
  if (supportsHover) {
    element.addEventListener('pointerenter', onPointerEnter);
    element.addEventListener('pointerleave', onPointerLeave);
  }

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(show)
    : null;
  resizeObserver?.observe(element);
  showFrame = requestAnimationFrame(show);

  return () => {
    clearHideTimer();
    if (showFrame) cancelAnimationFrame(showFrame);
    resizeObserver?.disconnect();
    element.removeEventListener('scroll', show);
    if (supportsHover) {
      element.removeEventListener('pointerenter', onPointerEnter);
      element.removeEventListener('pointerleave', onPointerLeave);
    }
    horizontalThumb.remove();
    verticalThumb.remove();
  };
}
