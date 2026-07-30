/**
 * On-demand runtime diagnostics. Off by default.
 * Enable: 长按左上角菜单约 0.5s  |  连点菜单 3 次  |  ?sheetDebug=1  |  ?courseDebug=1  |  __sheetDebug.toggle()
 * Disable: 再次长按/连点  |  条上「×」  |  ?sheetDebug=0
 *
 * Default UI is a compact top-right chip (build + log count). Tap chip to expand logs.
 * courseDebug=1 remains as a compatibility alias for the former course-only trace.
 */

const MAX_ENTRIES = 120;
const CONSOLE_PREFIX = '[twb-debug]';
const MENU_TAP_WINDOW_MS = 1400;
const MENU_TAP_COUNT = 3;
const MENU_LONG_PRESS_MS = 520;

/** @type {{ t: number, text: string, data?: object }[]} */
const entries = [];
/** Monotonic id for pointer / gesture diagnostic sessions (no PII). */
let gestureSessionSeq = 0;
let enabled = false;
let expanded = false;
let panel = null;
let chipEl = null;
let bodyEl = null;
let listEl = null;
let metaEl = null;
let menuTaps = [];
let longPressTimer = 0;
let suppressMenuClick = false;

function readBootFlag() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || '');
    if (params.get('sheetDebug') === '0') return false;
    if (params.get('courseDebug') === '1') return true;
    if (params.get('sheetDebug') === '1') return true;
    return globalThis.sessionStorage?.getItem('sheetDebug') === '1';
  } catch {
    return false;
  }
}

function readCourseDebugBoot() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || '');
    if (params.get('courseDebug') === '1') return true;
    return globalThis.sessionStorage?.getItem('courseDebug') === '1';
  } catch {
    return false;
  }
}

function persist(on) {
  try {
    if (on) globalThis.sessionStorage?.setItem('sheetDebug', '1');
    else globalThis.sessionStorage?.removeItem('sheetDebug');
  } catch {
    /* ignore */
  }
}

function buildId() {
  return document.documentElement.dataset.twbBuild || '…';
}

function styleChipButton(btn) {
  Object.assign(btn.style, {
    margin: '0',
    padding: '4px 8px',
    border: '0',
    borderRadius: '999px',
    background: 'rgba(255,255,255,.12)',
    color: '#e8eef8',
    font: '600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    cursor: 'pointer',
    pointerEvents: 'auto'
  });
}

function ensurePanel() {
  if (panel || typeof document === 'undefined') return;

  panel = document.createElement('div');
  panel.id = 'sheetDebugPanel';
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = [
    '<div data-chip>',
    '<button type="button" data-act="toggle" data-chip-btn title="展开/收起日志"></button>',
    '<button type="button" data-act="off" title="关闭调试">×</button>',
    '</div>',
    '<div data-body hidden>',
    '<div data-meta></div>',
    '<div data-toolbar>',
    '<button type="button" data-act="copy">复制</button>',
    '<button type="button" data-act="clear">清空</button>',
    '</div>',
    '<pre data-list></pre>',
    '</div>'
  ].join('');

  Object.assign(panel.style, {
    position: 'fixed',
    top: 'calc(8px + env(safe-area-inset-top, 0px))',
    right: '8px',
    left: 'auto',
    bottom: 'auto',
    zIndex: 'var(--layer-debug)',
    display: 'none',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
    maxWidth: 'min(320px, calc(100vw - 16px))',
    pointerEvents: 'none',
    font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    color: '#e8eef8'
  });

  const chipRow = panel.querySelector('[data-chip]');
  Object.assign(chipRow.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    pointerEvents: 'auto'
  });

  chipEl = panel.querySelector('[data-chip-btn]');
  Object.assign(chipEl.style, {
    margin: '0',
    padding: '6px 10px',
    border: '0',
    borderRadius: '999px',
    background: 'rgba(12, 16, 24, 0.88)',
    color: '#e8eef8',
    font: '600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    boxShadow: '0 4px 16px rgba(0,0,0,.28)',
    cursor: 'pointer',
    maxWidth: 'min(220px, 70vw)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  });

  const offBtn = panel.querySelector('[data-act="off"]');
  Object.assign(offBtn.style, {
    margin: '0',
    width: '28px',
    height: '28px',
    padding: '0',
    border: '0',
    borderRadius: '999px',
    background: 'rgba(12, 16, 24, 0.88)',
    color: '#e8eef8',
    font: '600 16px/28px system-ui, sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,.28)',
    cursor: 'pointer'
  });

  bodyEl = panel.querySelector('[data-body]');
  Object.assign(bodyEl.style, {
    width: 'min(320px, calc(100vw - 16px))',
    maxHeight: '36vh',
    display: 'none',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px',
    borderRadius: '12px',
    background: 'rgba(12, 16, 24, 0.94)',
    boxShadow: '0 8px 24px rgba(0,0,0,.35)',
    pointerEvents: 'auto'
  });

  metaEl = panel.querySelector('[data-meta]');
  Object.assign(metaEl.style, {
    opacity: '.85',
    wordBreak: 'break-all',
    fontSize: '10px'
  });

  const toolbar = panel.querySelector('[data-toolbar]');
  Object.assign(toolbar.style, {
    display: 'flex',
    gap: '6px'
  });
  toolbar.querySelectorAll('button').forEach(styleChipButton);

  listEl = panel.querySelector('[data-list]');
  Object.assign(listEl.style, {
    margin: '0',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    flex: '1',
    minHeight: '0',
    maxHeight: '26vh',
    padding: '6px',
    borderRadius: '8px',
    background: 'rgba(0,0,0,.28)',
    fontSize: '10px'
  });

  panel.addEventListener('click', (event) => {
    const act = event.target?.closest?.('[data-act]')?.getAttribute('data-act');
    if (act === 'toggle') {
      expanded = !expanded;
      render();
    } else if (act === 'clear') {
      entries.length = 0;
      render();
    } else if (act === 'copy') {
      navigator.clipboard?.writeText(dumpText()).catch(() => {});
    } else if (act === 'off') {
      setEnabled(false);
    }
  });
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  document.body.appendChild(panel);
}

function dumpText() {
  return `build ${buildId()}\norigin ${location.origin}\n` + entries.map((e) => e.text).join('\n');
}

function refreshMeta() {
  if (!metaEl) return;
  metaEl.textContent = location.origin;
}

function render() {
  if (!panel || !chipEl || !bodyEl || !listEl) return;
  panel.style.display = enabled ? 'flex' : 'none';
  chipEl.textContent = `build ${buildId()} · ${entries.length}`;
  chipEl.title = expanded ? '收起日志' : '展开日志';
  refreshMeta();
  bodyEl.style.display = expanded ? 'flex' : 'none';
  bodyEl.hidden = !expanded;
  if (expanded) {
    listEl.textContent = entries.length
      ? entries.map((e) => e.text).join('\n')
      : '（尚无记录）';
    listEl.scrollTop = listEl.scrollHeight;
  }
}

function setEnabled(on) {
  const next = Boolean(on);
  const changed = enabled !== next;
  enabled = next;
  if (!enabled) expanded = false;
  persist(enabled);
  ensurePanel();
  render();
  if (enabled && changed) {
    logSheetDebug({ kind: 'runtime', message: 'diagnostics enabled', detail: { maxEntries: MAX_ENTRIES } });
  }
}

function formatEntry(data) {
  const t = new Date(data.t || Date.now());
  const stamp = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`;
  if (data.kind === 'begin') {
    return [
      `${stamp} BEGIN ${data.id} origin=${data.dragOriginProgress?.toFixed?.(2)} presented=${data.presented} isOpen=${data.isOpen}`,
      formatMotion(data.motion)
    ].filter(Boolean).join('\n');
  }
  if (data.kind === 'end') {
    const stay = data.shouldOpen ? 'STAY' : 'CLOSE';
    return [
      `${stamp} ${stay} ${data.id} (${data.direction})`,
      `  reason=${data.reason}`,
      `  p=${Number(data.progress).toFixed(3)} origin=${Number(data.dragOriginProgress).toFixed(3)} startedOpen=${data.startedOpen}`,
      `  closedPx=${Math.round(data.closedPx)} minClose=${Math.round(data.minClosePx)}`,
      `  vY=${Number(data.velocityY).toFixed(3)} openV=${Number(data.openVelocity).toFixed(3)} closeV=${Number(data.closeVelocity ?? 0).toFixed(3)} travel=${Math.round(data.travel)}`,
      `  projected=${Number(data.projected).toFixed(3)} projClosed=${Math.round(data.projectedClosedPx ?? 0)} openPx=${Math.round(data.openPx)} cancelled=${data.cancelled}`,
      formatMotion(data.motion)
    ].filter(Boolean).join('\n');
  }
  if (data.kind === 'course' || data.kind === 'gesture' || data.kind === 'logic' || data.kind === 'runtime' || data.kind === 'motion') {
    const extra = formatDetail(data.detail);
    return `${stamp} ${data.kind.toUpperCase()} ${data.message || ''}${extra}`;
  }
  return `${stamp} ${data.message || safeStringify(data)}`;
}

function formatDetail(detail) {
  if (detail === undefined || detail === '') return '';
  return ` · ${typeof detail === 'string' ? detail : safeStringify(detail)}`;
}

function formatMotion(motion) {
  if (!motion) return '';
  return `  motion=${motion.property} ${motion.duration} ${motion.timing} reduced=${motion.reduced}`;
}

function safeStringify(value) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (_key, current) => {
      if (typeof Element !== 'undefined' && current instanceof Element) return describeDebugTarget(current);
      if (current instanceof Error) {
        return { name: current.name, message: current.message, stack: current.stack?.split('\n').slice(0, 2).join('\n') };
      }
      if (typeof current === 'number' && !Number.isFinite(current)) return String(current);
      if (current && typeof current === 'object') {
        if (seen.has(current)) return '[circular]';
        seen.add(current);
      }
      return current;
    });
  } catch {
    return '"[unserializable]"';
  }
}

function writeConsoleEntry(data, timestamp) {
  const record = {
    source: 'teacher-workbench',
    timestamp: new Date(timestamp).toISOString(),
    kind: data.kind || 'event',
    event: data.message || '',
    detail: data.detail ?? null
  };
  for (const [key, value] of Object.entries(data)) {
    if (!(key in record) && key !== 't') record[key] = value;
  }
  try {
    // Android WebView drops secondary console arguments. One structured string
    // keeps the payload intact in Capacitor/Console and avoids "Msg: undefined".
    console.info(`${CONSOLE_PREFIX} ${safeStringify(record)}`);
  } catch {
    /* diagnostics must never affect application flow */
  }
}

function clearLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
  }
}

function bindMenuToggle() {
  const menu = document.getElementById('menuButton');
  if (!menu) return;

  menu.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    clearLongPress();
    longPressTimer = window.setTimeout(() => {
      longPressTimer = 0;
      suppressMenuClick = true;
      setEnabled(!enabled);
    }, MENU_LONG_PRESS_MS);
  }, true);

  const cancelPress = () => clearLongPress();
  menu.addEventListener('pointerup', cancelPress, true);
  menu.addEventListener('pointercancel', cancelPress, true);
  menu.addEventListener('pointerleave', cancelPress, true);

  menu.addEventListener('click', (event) => {
    if (!suppressMenuClick) return;
    suppressMenuClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('pointerup', (event) => {
    const hit = event.target?.closest?.('#menuButton');
    if (!hit) return;
    const now = Date.now();
    menuTaps = menuTaps.filter((t) => now - t < MENU_TAP_WINDOW_MS);
    menuTaps.push(now);
    if (menuTaps.length >= MENU_TAP_COUNT) {
      menuTaps = [];
      setEnabled(!enabled);
    }
  }, true);
}

export function isSheetDebugEnabled() {
  return enabled;
}

export function describeDebugTarget(target) {
  if (!(target instanceof Element)) return String(target ?? 'null');
  const id = target.id ? `#${target.id}` : '';
  const cls = typeof target.className === 'string' && target.className.trim()
    ? `.${target.className.trim().split(/\s+/).slice(0, 4).join('.')}`
    : '';
  return `${target.tagName.toLowerCase()}${id}${cls}`;
}

export function logSheetDebug(data) {
  if (!enabled) return;
  ensurePanel();
  const timestamp = Date.now();
  const entry = { t: timestamp, data, text: formatEntry({ ...data, t: timestamp }) };
  entries.push(entry);
  while (entries.length > MAX_ENTRIES) entries.shift();
  writeConsoleEntry(data, timestamp);
  // Keep chip count fresh; never auto-expand (covers sheets / IME).
  if (chipEl) chipEl.textContent = `build ${buildId()} · ${entries.length}`;
  else render();
  if (expanded && listEl) {
    listEl.textContent = entries.map((e) => e.text).join('\n');
    listEl.scrollTop = listEl.scrollHeight;
  }
}

/** Course-input trace: no-op unless debug panel is on. */
export function logCourseDebug(message, detail = '') {
  logSheetDebug({ kind: 'course', message, detail });
}

/** Gesture boundaries only; deliberately never used for pointermove frames. */
export function logGestureDebug(message, detail = {}) {
  logSheetDebug({ kind: 'gesture', message, detail });
}

/** Allocate a short session id for one physical pointer sequence. */
export function nextGestureSessionId() {
  gestureSessionSeq += 1;
  return `g${gestureSessionSeq}`;
}

/**
 * Boundary log with required diagnostic fields.
 * Callers must not pass names, scores, raw input, or per-frame move samples.
 *
 * @param {string} message
 * @param {{
 *   sessionId: string,
 *   owner: string,
 *   activationSource?: string | null,
 *   clearReason?: string | null,
 *   [key: string]: unknown
 * }} detail
 */
export function logGestureSession(message, detail) {
  const {
    sessionId,
    owner,
    activationSource = null,
    clearReason = null,
    ...rest
  } = detail || {};
  logGestureDebug(message, {
    sessionId,
    owner,
    activationSource,
    clearReason,
    ...rest
  });
}

/** User-visible business actions without names, score values, or raw input text. */
export function logLogicDebug(message, detail = {}) {
  logSheetDebug({ kind: 'logic', message, detail });
}

export function getMotionDebugSnapshot(element) {
  if (!element || typeof globalThis.getComputedStyle !== 'function') return null;
  const styles = globalThis.getComputedStyle(element);
  return {
    property: styles.transitionProperty,
    duration: styles.transitionDuration,
    timing: styles.transitionTimingFunction,
    delay: styles.transitionDelay,
    reduced: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
  };
}

function errorDetail(value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.split('\n').slice(0, 2).join('\n') };
  }
  return { value: typeof value === 'string' ? value : safeStringify(value) };
}

function bindRuntimeDiagnostics() {
  globalThis.addEventListener?.('error', (event) => {
    logSheetDebug({
      kind: 'runtime',
      message: 'uncaught error',
      detail: {
        ...errorDetail(event.error || event.message),
        source: event.filename || '',
        line: event.lineno || 0,
        column: event.colno || 0
      }
    });
  });
  globalThis.addEventListener?.('unhandledrejection', (event) => {
    logSheetDebug({ kind: 'runtime', message: 'unhandled rejection', detail: errorDetail(event.reason) });
  });
}

export function initSheetDebug() {
  const courseBoot = readCourseDebugBoot();
  setEnabled(readBootFlag());
  if (courseBoot) {
    try { globalThis.sessionStorage?.setItem('courseDebug', '1'); } catch { /* ignore */ }
    // Stay collapsed — only enable capture + console.
    logCourseDebug('courseDebug boot', 'chip only; tap build to open logs');
  }

  const observer = new MutationObserver(() => {
    if (enabled) render();
  });
  if (typeof document !== 'undefined') {
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-twb-build'] });
  }
  bindRuntimeDiagnostics();

  globalThis.__sheetDebug = {
    isEnabled: () => enabled,
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    toggle: () => setEnabled(!enabled),
    openLogs: () => { expanded = true; if (enabled) render(); },
    enableCourse: () => {
      try { globalThis.sessionStorage?.setItem('courseDebug', '1'); } catch { /* ignore */ }
      setEnabled(true);
      expanded = false;
      render();
      logCourseDebug('courseDebug enabled', 'via __sheetDebug.enableCourse()');
    },
    entries: () => entries.slice(),
    dump: dumpText
  };

  bindMenuToggle();
}
