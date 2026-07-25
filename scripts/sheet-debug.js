/**
 * Sheet / version / course-input diagnostics. Off by default.
 * Enable: 长按左上角菜单约 0.5s  |  连点菜单 3 次  |  ?sheetDebug=1  |  ?courseDebug=1  |  __sheetDebug.toggle()
 * Disable: 再次长按/连点  |  浮层「关」  |  ?sheetDebug=0
 *
 * courseDebug=1 also expands the log list and tags course-input events for copy/export.
 */

const MAX_ENTRIES = 80;
const MENU_TAP_WINDOW_MS = 1400;
const MENU_TAP_COUNT = 3;
const MENU_LONG_PRESS_MS = 520;

/** @type {{ t: number, text: string, data?: object }[]} */
const entries = [];
let enabled = false;
let logsOpen = false;
let panel = null;
let listEl = null;
let metaEl = null;
let logsBtn = null;
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

function metaHtml() {
  const build = document.documentElement.dataset.twbBuild || '…';
  return [
    `<div style="font-size:15px;font-weight:700;letter-spacing:.02em">build ${build}</div>`,
    `<div style="margin-top:4px;opacity:.85;word-break:break-all">origin ${location.origin}</div>`
  ].join('');
}

function styleButton(btn, accent = false) {
  Object.assign(btn.style, {
    margin: '0',
    padding: '6px 10px',
    border: '0',
    borderRadius: '8px',
    background: accent ? '#4f7cff' : '#3a465c',
    color: '#fff',
    font: '12px/1.2 system-ui, sans-serif',
    cursor: 'pointer'
  });
}

function ensurePanel() {
  if (panel || typeof document === 'undefined') return;
  panel = document.createElement('div');
  panel.id = 'sheetDebugPanel';
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = [
    '<div data-hd>',
    '<strong style="font:600 13px/1.2 system-ui,sans-serif">调试</strong>',
    '<span data-actions>',
    '<button type="button" data-act="copy">复制</button>',
    '<button type="button" data-act="clear">清空</button>',
    '<button type="button" data-act="off">关</button>',
    '</span>',
    '</div>',
    '<div data-meta></div>',
    '<button type="button" data-act="logs" data-logs-btn></button>',
    '<pre data-list></pre>'
  ].join('');

  Object.assign(panel.style, {
    position: 'fixed',
    left: '10px',
    right: '10px',
    // Top — bottom sheets / IME actions must stay tappable underneath.
    top: 'calc(10px + env(safe-area-inset-top, 0px))',
    bottom: 'auto',
    maxHeight: '42vh',
    zIndex: '99999',
    display: 'none',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    borderRadius: '14px',
    background: 'rgba(12, 16, 24, 0.94)',
    color: '#e8eef8',
    font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    boxShadow: '0 10px 32px rgba(0,0,0,.4)',
    pointerEvents: 'auto'
  });

  const hd = panel.querySelector('[data-hd]');
  Object.assign(hd.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexShrink: '0'
  });

  panel.querySelectorAll('[data-actions] button').forEach((btn) => styleButton(btn));

  metaEl = panel.querySelector('[data-meta]');
  Object.assign(metaEl.style, {
    flexShrink: '0',
    padding: '10px 12px',
    borderRadius: '10px',
    background: 'rgba(79, 124, 255, 0.18)',
    border: '1px solid rgba(79, 124, 255, 0.35)'
  });
  metaEl.innerHTML = metaHtml();

  logsBtn = panel.querySelector('[data-logs-btn]');
  styleButton(logsBtn, true);
  logsBtn.style.width = '100%';

  listEl = panel.querySelector('[data-list]');
  Object.assign(listEl.style, {
    margin: '0',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    flex: '1',
    minHeight: '0',
    maxHeight: '28vh',
    padding: '8px',
    borderRadius: '10px',
    background: 'rgba(0,0,0,.25)'
  });

  panel.addEventListener('click', (event) => {
    const act = event.target?.closest?.('[data-act]')?.getAttribute('data-act');
    if (act === 'clear') {
      entries.length = 0;
      render();
    } else if (act === 'copy') {
      const build = document.documentElement.dataset.twbBuild || '';
      const head = `build ${build}\norigin ${location.origin}\n`;
      const text = head + entries.map((e) => e.text).join('\n');
      navigator.clipboard?.writeText(text).catch(() => {});
    } else if (act === 'off') {
      setEnabled(false);
    } else if (act === 'logs') {
      logsOpen = !logsOpen;
      render();
    }
  });
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  document.body.appendChild(panel);
}

function refreshMeta() {
  if (!metaEl) return;
  metaEl.innerHTML = metaHtml();
}

function render() {
  if (!panel || !listEl || !logsBtn) return;
  panel.style.display = enabled ? 'flex' : 'none';
  refreshMeta();
  logsBtn.textContent = logsOpen ? '收起手势日志 ▲' : `手势日志 (${entries.length}) ▼`;
  listEl.style.display = logsOpen ? 'block' : 'none';
  if (logsOpen) {
    listEl.textContent = entries.length
      ? entries.map((e) => e.text).join('\n')
      : '（尚无记录：点课表格输入，或打开 Sheet 后轻滑）';
    listEl.scrollTop = listEl.scrollHeight;
  }
}

function setEnabled(on) {
  enabled = Boolean(on);
  if (!enabled) logsOpen = false;
  persist(enabled);
  ensurePanel();
  render();
}

function formatEntry(data) {
  const t = new Date(data.t || Date.now());
  const stamp = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`;
  if (data.kind === 'begin') {
    return `${stamp} BEGIN ${data.id} origin=${data.dragOriginProgress?.toFixed?.(2)} presented=${data.presented} isOpen=${data.isOpen}`;
  }
  if (data.kind === 'end') {
    const stay = data.shouldOpen ? 'STAY' : 'CLOSE';
    return [
      `${stamp} ${stay} ${data.id} (${data.direction})`,
      `  reason=${data.reason}`,
      `  p=${Number(data.progress).toFixed(3)} origin=${Number(data.dragOriginProgress).toFixed(3)} startedOpen=${data.startedOpen}`,
      `  closedPx=${Math.round(data.closedPx)} minClose=${Math.round(data.minClosePx)}`,
      `  vY=${Number(data.velocityY).toFixed(3)} openV=${Number(data.openVelocity).toFixed(3)} closeV=${Number(data.closeVelocity ?? 0).toFixed(3)} travel=${Math.round(data.travel)}`,
      `  projected=${Number(data.projected).toFixed(3)} projClosed=${Math.round(data.projectedClosedPx ?? 0)} openPx=${Math.round(data.openPx)} cancelled=${data.cancelled}`
    ].join('\n');
  }
  if (data.kind === 'course') {
    const extra = data.detail ? ` · ${data.detail}` : '';
    return `${stamp} COURSE ${data.message || ''}${extra}`;
  }
  return `${stamp} ${data.message || JSON.stringify(data)}`;
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
  const entry = { t: Date.now(), data, text: formatEntry({ ...data, t: Date.now() }) };
  entries.push(entry);
  while (entries.length > MAX_ENTRIES) entries.shift();
  if (data.kind === 'course') {
    logsOpen = true;
    try { console.info('[course-debug]', data.message || '', data.detail || data); } catch { /* ignore */ }
  }
  render();
}

/** Course-input trace: no-op unless debug panel is on. */
export function logCourseDebug(message, detail = '') {
  logSheetDebug({ kind: 'course', message, detail });
}

export function initSheetDebug() {
  const courseBoot = readCourseDebugBoot();
  setEnabled(readBootFlag());
  if (courseBoot) {
    try { globalThis.sessionStorage?.setItem('courseDebug', '1'); } catch { /* ignore */ }
    logsOpen = true;
    ensurePanel();
    render();
    logCourseDebug('courseDebug boot', 'logs open — tap a schedule cell and type');
  }

  const observer = new MutationObserver(() => {
    if (enabled) refreshMeta();
  });
  if (typeof document !== 'undefined') {
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-twb-build'] });
  }

  globalThis.__sheetDebug = {
    isEnabled: () => enabled,
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    toggle: () => setEnabled(!enabled),
    openLogs: () => { logsOpen = true; if (enabled) render(); },
    enableCourse: () => {
      try { globalThis.sessionStorage?.setItem('courseDebug', '1'); } catch { /* ignore */ }
      setEnabled(true);
      logsOpen = true;
      render();
      logCourseDebug('courseDebug enabled', 'via __sheetDebug.enableCourse()');
    },
    entries: () => entries.slice(),
    dump: () => {
      const build = document.documentElement.dataset.twbBuild || '';
      return `build ${build}\norigin ${location.origin}\n` + entries.map((e) => e.text).join('\n');
    }
  };

  bindMenuToggle();
}
