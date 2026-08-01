import { elements } from './dom.js';
import { setActiveOverlay } from './state.js';
import { createSheetController } from './sheet-drag.js';
import { blurIfSheetChrome, focusSilently } from './focus.js';
import {
  HIGHLIGHT_SUBJECTS_STORAGE_KEY,
  parseHighlightPatterns,
  subjectMatchesHighlight
} from './highlight-subjects-model.js';
import { bindImmediateAction, createGhostClickGuard } from './pointer-guards.js';

export {
  HIGHLIGHT_SUBJECTS_STORAGE_KEY,
  parseHighlightPatterns,
  formatHighlightPatterns,
  subjectMatchesHighlight
} from './highlight-subjects-model.js';

/** @type {string[]} */
let patterns = [];
/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    localStorage.setItem(HIGHLIGHT_SUBJECTS_STORAGE_KEY, JSON.stringify({ patterns }));
  } catch {
    // Preference persist is best-effort.
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(HIGHLIGHT_SUBJECTS_STORAGE_KEY);
    if (raw == null) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.patterns)) {
      patterns = parseHighlightPatterns(parsed.patterns.join('\n'));
      return;
    }
    if (typeof parsed === 'string') {
      patterns = parseHighlightPatterns(parsed);
    }
  } catch {
    patterns = [];
  }
}

export function getHighlightPatterns() {
  return patterns.slice();
}

export function setHighlightPatterns(next) {
  patterns = parseHighlightPatterns(
    Array.isArray(next) ? next.join('\n') : String(next ?? '')
  );
  persist();
  notify();
  return patterns.slice();
}

export function subscribeHighlightSubjects(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Settings page contextual-action wiring helpers.
 */
export function initHighlightSubjects({ showToast, viewport, closeOthers }) {
  restore();

  const layer = document.createElement('div');
  layer.className = 'course-highlight-sheet';
  layer.inert = true;
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = [
    '<section class="course-highlight-panel sheet-panel sheet-panel--top" role="dialog" aria-modal="true" aria-labelledby="courseHighlightTitle">',
    '<div class="sheet-title"><span>课表</span><h2 id="courseHighlightTitle">高亮科目</h2></div>',
    '<p class="course-edit-hint">输入要弱强调的科目关键词，用顿号、逗号或换行分隔。课表格文案包含任一关键词时显示淡蓝样式。</p>',
    '<label class="course-edit-field course-highlight-field"><span>关键词</span>',
    '<textarea data-field="input" rows="4" autocomplete="off" enterkeyhint="done"></textarea></label>',
    '<div class="course-edit-actions">',
    '<button type="button" data-action="cancel">取消</button>',
    '<button type="button" class="primary" data-action="save">保存</button>',
    '</div>',
    '<button type="button" class="course-edit-clear" data-action="clear">清除全部</button>',
    '<div class="sheet-handle-zone sheet-handle-zone--bottom" aria-hidden="true"><div class="sheet-handle"></div></div>',
    '</section>'
  ].join('');
  elements.app.append(layer);

  const panel = layer.querySelector('.course-highlight-panel');
  const input = layer.querySelector('[data-field="input"]');
  const clearBtn = layer.querySelector('[data-action="clear"]');
  let returnFocus = null;
  let sheet;

  function close({ restoreFocus = true } = {}) {
    if (!sheet?.isPresented() && !layer.classList.contains('show')) return;
    if (!restoreFocus) returnFocus = null;
    if (sheet?.isPresented()) sheet.closeInstant();
    else {
      layer.classList.remove('show');
      layer.inert = true;
      layer.setAttribute('aria-hidden', 'true');
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = returnFocus;
      returnFocus = null;
      if (restoreFocus && focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  }

  function open({ returnFocus: focusEl } = {}) {
    closeOthers?.('course-highlight');
    returnFocus = focusEl ?? elements.moreButton;
    input.value = patterns.join('\n');
    clearBtn.hidden = patterns.length === 0;
    viewport?.lockStudentGrid?.();
    sheet.openInstant();
  }

  function save() {
    const next = setHighlightPatterns(input.value);
    showToast(next.length ? `已设置 ${next.length} 个高亮词` : '已关闭科目高亮');
    close();
  }

  sheet = createSheetController({
    id: 'course-highlight',
    layer,
    panel,
    direction: 'from-top',
    scrollPorts: [panel],
    isOpen: () => layer.classList.contains('show') && !sheet?.isActive(),
    onPrepare() {
      setActiveOverlay('course-highlight');
      layer.setAttribute('aria-hidden', 'false');
    },
    onOpened() {
      setActiveOverlay('course-highlight');
      layer.inert = false;
      layer.classList.add('show');
      requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
      });
    },
    onClosed() {
      layer.classList.remove('show');
      layer.inert = true;
      layer.setAttribute('aria-hidden', 'true');
      viewport?.unlockStudentGrid?.();
      setActiveOverlay(null);
      const focus = returnFocus;
      returnFocus = null;
      if (focus) focusSilently(focus);
      else blurIfSheetChrome();
    }
  });

  const underlyingGhostGuard = createGhostClickGuard({
    owner: 'highlight-subjects',
    hitSelector: '#weekStrip, #gradeTable, .week-slot-cell, .week-period-label, .grade-score-cell, .grade-subject-head'
  });

  bindImmediateAction(layer.querySelector('[data-action="cancel"]'), () => close(), {
    armGhost: (ms) => underlyingGhostGuard.arm(ms),
    owner: 'highlight-subjects'
  });
  bindImmediateAction(layer.querySelector('[data-action="save"]'), () => save(), {
    armGhost: (ms) => underlyingGhostGuard.arm(ms),
    owner: 'highlight-subjects'
  });
  bindImmediateAction(clearBtn, () => {
    input.value = '';
    clearBtn.hidden = true;
    setHighlightPatterns([]);
    showToast('已清除科目高亮');
    close();
  }, {
    armGhost: (ms) => underlyingGhostGuard.arm(ms),
    owner: 'highlight-subjects'
  });
  layer.addEventListener('click', (event) => {
    if (event.target === layer && !sheet.isActive()) close();
  });
  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value.trim() && patterns.length === 0;
  });

  function dismissBack() {
    if (!sheet.isPresented() && !layer.classList.contains('show')) return false;
    close();
    return true;
  }

  return {
    open,
    close,
    dismissBack,
    matches: (subject) => subjectMatchesHighlight(subject, patterns),
    subscribe: subscribeHighlightSubjects,
    getPatterns: getHighlightPatterns
  };
}
