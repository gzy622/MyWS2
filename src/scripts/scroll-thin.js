/**
 * Soft auto-hide scrollbar chrome for `.scroll-thin`.
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
  '.people-edit-sheet',
  '.menu-drawer'
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
  '.menu-drawer',
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
  let hover = false;

  const clearHideTimer = () => {
    if (!hideTimer) return;
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  };

  const dismissNow = () => {
    clearHideTimer();
    hover = false;
    thumb.classList.add('is-snap-hide');
    thumb.classList.remove('is-visible', 'is-ready');
    window.requestAnimationFrame(() => thumb.classList.remove('is-snap-hide'));
  };

  const show = () => {
    if (!syncThumbGeometry(element, thumb, panel instanceof HTMLElement ? panel : null, mode, layer)) {
      dismissNow();
      return;
    }
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
    }, readMs('--scrollbar-hold', 1100));
  };

  element.addEventListener('scroll', show, { passive: true });

  if (globalThis.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches) {
    element.addEventListener('pointerenter', () => {
      hover = true;
      clearHideTimer();
      if (syncThumbGeometry(element, thumb, panel instanceof HTMLElement ? panel : null, mode, layer)) {
        thumb.classList.remove('is-snap-hide');
        window.requestAnimationFrame(() => {
          if (isSheetPresented(element, layer)) thumb.classList.add('is-visible');
        });
      }
    });
    element.addEventListener('pointerleave', () => {
      hover = false;
      thumb.classList.remove('is-visible');
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
