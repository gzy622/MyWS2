/**
 * On-demand runtime diagnostics. Off by default.
 * Enable: 长按左上角设置约 0.5s  |  连点设置 3 次  |  ?sheetDebug=1  |  ?courseDebug=1  |  __sheetDebug.toggle()
 * Disable: 再次长按/连点  |  条上「×」  |  ?sheetDebug=0
 *
 * Default UI is a single draggable capsule below the topbar with three parts:
 * 复现标记按钮、详情按钮（详情 ▾）和日志条数。Drag the capsule to
 * reposition (session-only). To capture a repro window, tap the red dot (or toolbar「标记复现」)
 * before reproducing a bug, then stop — the window is reported automatically:
 * POSTed to the LAN server (.debug-rec/, git-ignored), written to the app private
 * files when Capacitor is present, and copied to the clipboard as a fallback.
 * Every console entry carries the recId for adb retrieval. 「上报最近日志」uploads the recent
 * buffer without marking a repro window. courseDebug=1 remains as a compatibility alias for the
 * former course-only trace.
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
/** 复现窗口：开始标记后收集新条目，停止时导出为可复制/可抓取的文本块。 */
let recording = false;
let recordId = '';
let recordStartAt = 0;
let recordEndAt = 0;
let recordEntries = [];
let recordText = '';
let recordStatus = '';
let countEl = null;

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
    '<button type="button" data-act="record" data-record-btn title="开始标记复现"></button>',
    '<button type="button" data-act="toggle" data-chip-btn title="展开/收起详情">详情 ▾</button>',
    '<span data-count aria-hidden="true"></span>',
    '</div>',
    '<div data-body hidden>',
    '<div data-meta></div>',
    '<div data-toolbar>',
    '<button type="button" data-act="record">标记复现</button>',
    '<button type="button" data-act="export">上报最近日志</button>',
    '<button type="button" data-act="clear">清空</button>',
    '<button type="button" data-act="off">关闭</button>',
    '</div>',
    '<pre data-list></pre>',
    '</div>'
  ].join('');

  Object.assign(panel.style, {
    position: 'fixed',
    // 顶栏下方右侧：不遮挡顶栏「更多」按钮、标题与顶部 Sheet。
    top: 'calc(var(--topbar-h) + env(safe-area-inset-top, 0px) + 4px)',
    right: '8px',
    left: 'auto',
    bottom: 'auto',
    zIndex: 'var(--layer-debug)',
    display: 'none',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
    maxWidth: 'min(300px, calc(100vw - 16px))',
    pointerEvents: 'none',
    font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    color: '#e8eef8'
  });

  // 整体胶囊：三个部分共用一个深色圆角底，可整体拖拽移动。
  const chipRow = panel.querySelector('[data-chip]');
  Object.assign(chipRow.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    pointerEvents: 'auto',
    background: 'rgba(12, 16, 24, 0.68)',
    borderRadius: '999px',
    boxShadow: '0 1px 6px rgba(0,0,0,.18)',
    touchAction: 'none',
    cursor: 'grab',
    userSelect: 'none'
  });

  chipEl = panel.querySelector('[data-chip-btn]');
  Object.assign(chipEl.style, {
    margin: '0',
    padding: '4px 6px',
    border: '0',
    borderRight: '1px solid rgba(255,255,255,.16)',
    borderRadius: '0',
    background: 'transparent',
    color: '#e8eef8',
    font: '600 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    boxShadow: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  });

  // 复现标记按钮：视觉 12px，命中 36×36，位于胶囊左侧。
  const recordBtn = panel.querySelector('[data-record-btn]');
  Object.assign(recordBtn.style, {
    margin: '0',
    width: '36px',
    height: '36px',
    padding: '0',
    border: '0',
    borderRadius: '999px',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  });
  recordBtn.innerHTML = '<span style="display:block;width:12px;height:12px;border:2px solid rgba(224,235,248,.9);border-radius:999px;background:transparent;box-sizing:border-box"></span>';

  countEl = panel.querySelector('[data-count]');
  Object.assign(countEl.style, {
    padding: '0 10px 0 4px',
    color: '#e8eef8',
    font: '600 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    opacity: '.85'
  });

  bodyEl = panel.querySelector('[data-body]');
  Object.assign(bodyEl.style, {
    position: 'fixed',
    width: 'min(280px, calc(100vw - 16px))',
    maxHeight: '28vh',
    display: 'none',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    borderRadius: '12px',
    background: 'rgba(12, 16, 24, 0.92)',
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
    maxHeight: '20vh',
    padding: '6px',
    borderRadius: '8px',
    background: 'rgba(0,0,0,.28)',
    fontSize: '10px',
    userSelect: 'text',
    WebkitUserSelect: 'text'
  });

  panel.addEventListener('click', (event) => {
    const act = event.target?.closest?.('[data-act]')?.getAttribute('data-act');
    if (act === 'toggle') {
      expanded = !expanded;
      render();
    } else if (act === 'record') {
      if (recording) stopRecording();
      else {
        startRecording();
        render();
      }
    } else if (act === 'export') {
      exportLogs();
    } else if (act === 'clear') {
      entries.length = 0;
      recordText = '';
      recordStatus = '';
      render();
    } else if (act === 'off') {
      setEnabled(false);
    }
  });
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  // 展开态下点击面板外任意处立即收起日志；只收起、不关闭调试，也不干预其它手势。
  document.addEventListener('pointerdown', (event) => {
    if (expanded && !panel.contains(event.target)) {
      expanded = false;
      render();
    }
  });
  const savedPos = loadChipPosition();
  if (savedPos) {
    panel.style.left = `${savedPos.x}px`;
    panel.style.top = `${savedPos.y}px`;
    panel.style.right = 'auto';
  }
  initChipDrag();
  document.body.appendChild(panel);
}

function loadChipPosition() {
  try {
    const raw = globalThis.sessionStorage?.getItem('sheetDebugPos');
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
  } catch {
    /* ignore */
  }
  return null;
}

function saveChipPosition(x, y) {
  try {
    globalThis.sessionStorage?.setItem('sheetDebugPos', JSON.stringify({ x, y }));
  } catch {
    /* ignore */
  }
}

function applyChipPosition(x, y) {
  const chipRect = panel.querySelector('[data-chip]').getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  x = Math.min(Math.max(x, 8), vw - chipRect.width - 8);
  y = Math.min(Math.max(y, 8), vh - chipRect.height - 8);
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
  panel.style.right = 'auto';
}

/** 胶囊整体拖拽：>6px 判定为拖动。轻点不捕获指针，保证按钮 click 正常派发。 */
function initChipDrag() {
  const chipRow = panel.querySelector('[data-chip]');
  if (!chipRow) return;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let dragging = false;
  let suppressClick = false;
  let pointerId = 0;

  const onMove = (event) => {
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) > 6) {
      dragging = true;
      suppressClick = true;
      chipRow.style.cursor = 'grabbing';
      // 仅拖动开始后才捕获：此后 click 目标变为胶囊，与抑制逻辑一致。
      try {
        chipRow.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }
    if (dragging) applyChipPosition(startLeft + dx, startTop + dy);
  };

  const onEnd = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onEnd);
    document.removeEventListener('pointercancel', onEnd);
    if (dragging) {
      suppressClick = true;
      const rect = panel.getBoundingClientRect();
      saveChipPosition(rect.left, rect.top);
      window.setTimeout(() => {
        suppressClick = false;
      }, 450);
    }
    chipRow.style.cursor = 'grab';
  };

  chipRow.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    startX = event.clientX;
    startY = event.clientY;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    dragging = false;
    pointerId = event.pointerId;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
  });

  chipRow.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function dumpText() {
  return `build ${buildId()}\norigin ${location.origin}\n` + entries.map((e) => e.text).join('\n');
}

function formatClock(timestamp) {
  const t = new Date(timestamp);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
}

function emitRecordMarker(event, extra = {}) {
  try {
    writeConsoleEntry({ kind: 'record', event, recId: recordId, ...extra }, Date.now());
  } catch {
    /* ignore */
  }
}

function buildRecordText(id, captured, startAt, endAt) {
  return [
    '【教师工作台 · 调试录制】',
    `build: ${buildId()}`,
    `origin: ${location.origin}`,
    `recId: ${id}`,
    `时间: ${formatClock(startAt)} → ${formatClock(endAt)} · ${captured.length} 条`,
    '---',
    ...captured.map((e) => e.text),
    '---',
    '结束'
  ].join('\n');
}

async function uploadToLanServer(text) {
  try {
    const url = new URL(globalThis.location?.href || '');
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return { ok: false };
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${url.origin}/__rec`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: text,
        signal: controller.signal
      });
      if (!res.ok) return { ok: false };
      const payload = await res.json().catch(() => null);
      return { ok: Boolean(payload?.ok), file: payload?.file };
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    return { ok: false };
  }
}

async function saveToDeviceFile(text, fileName) {
  const cap = globalThis.Capacitor;
  if (!cap?.Plugins?.Filesystem) return { ok: false };
  try {
    const { Filesystem, Directory, Encoding } = cap.Plugins;
    await Filesystem.writeFile({
      path: fileName,
      data: text,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** 自动上报：LAN 电脑文件 → App 私有文件 → 剪贴板兜底。 */
async function reportRecord(text, id) {
  const results = [];
  const lan = await uploadToLanServer(text);
  if (lan.ok) results.push('已存电脑');
  const dev = await saveToDeviceFile(text, `twb-rec-${id}.log`);
  if (dev.ok) results.push('已存 App');
  const copied = copyText(text);
  if (copied) results.push('已复制');
  return results.join(' · ');
}

/** 一键上报当前缓冲：无需预先标记复现，发现 bug 后直接点。 */
async function exportLogs() {
  if (!entries.length) {
    recordStatus = '暂无日志可上报';
    render();
    return;
  }
  const id = `exp-${Date.now().toString(36)}`;
  recordText = [
    '【教师工作台 · 日志导出】',
    `build: ${buildId()}`,
    `origin: ${location.origin}`,
    `recId: ${id}`,
    `时间: ${formatClock(Date.now())} · ${entries.length} 条`,
    '---',
    ...entries.map((e) => e.text),
    '---',
    '结束'
  ].join('\n');
  recordStatus = `上报最近 ${entries.length} 条 · 上报中…`;
  render();
  const report = await reportRecord(recordText, id);
  recordStatus = `上报最近 ${entries.length} 条 · ${report || '上报失败'}`;
  render();
}

function setRecordCopied(ok) {
  if (!ok) return;
  if (!recordStatus.includes('已复制')) {
    recordStatus = recordStatus.replace(/ · 复制失败.*$/, '') + ' · 已复制';
  }
  refreshMeta();
}

function fallbackCopy(text) {
  let ok = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
    ta.remove();
  } catch {
    ok = false;
  }
  return ok;
}

function copyText(text) {
  if (!text) return false;
  if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => setRecordCopied(true),
      () => setRecordCopied(fallbackCopy(text))
    );
    return true;
  }
  return fallbackCopy(text);
}

function startRecording() {
  if (recording) return;
  const id = `rec-${Date.now().toString(36)}`;
  const at = Date.now();
  logSheetDebug({ kind: 'runtime', message: 'record begin', detail: { recId: id } });
  recording = true;
  recordId = id;
  recordStartAt = at;
  recordEndAt = 0;
  recordEntries = [];
  recordText = '';
  recordStatus = '';
  emitRecordMarker('begin', { at });
}

async function stopRecording() {
  if (!recording) return;
  recordEndAt = Date.now();
  const captured = recordEntries.slice();
  const id = recordId;
  const startAt = recordStartAt;
  recording = false;
  recordText = buildRecordText(id, captured, startAt, recordEndAt);
  recordStatus = `已截取 ${captured.length} 条 · 上报中…`;
  emitRecordMarker('end', { at: recordEndAt, count: captured.length });
  logSheetDebug({ kind: 'runtime', message: 'record end', detail: { recId: id, count: captured.length } });
  render();
  const report = await reportRecord(recordText, id);
  recordStatus = `已截取 ${captured.length} 条 · ${report || '上报失败'}`;
  render();
}

function refreshMeta() {
  if (!metaEl) return;
  metaEl.textContent = recordStatus ? `${location.origin} · ${recordStatus}` : location.origin;
}

function renderRecordButton() {
  if (!panel) return;
  const btn = panel.querySelector('[data-record-btn]');
  const dot = btn?.firstElementChild;
  if (!btn || !dot) return;
  if (recording) {
    dot.style.borderRadius = '3px';
    dot.style.background = '#69c8ff';
    dot.style.border = '2px solid #ffffff';
    dot.style.boxShadow = '0 0 0 3px rgba(105, 200, 255, .32)';
    btn.dataset.state = 'active';
    btn.setAttribute('aria-label', '停止并上报复现日志');
    btn.title = '停止并上报复现日志';
  } else {
    dot.style.borderRadius = '999px';
    dot.style.background = 'transparent';
    dot.style.border = '2px solid rgba(224, 235, 248, .9)';
    dot.style.boxShadow = 'none';
    btn.dataset.state = 'idle';
    btn.setAttribute('aria-label', '开始标记复现');
    btn.title = '开始标记复现';
  }
}

function layoutExpandedBody() {
  const chip = panel?.querySelector('[data-chip]');
  if (!chip || !bodyEl) return;
  const viewport = globalThis.visualViewport;
  const viewportWidth = viewport?.width || window.innerWidth;
  const viewportHeight = viewport?.height || window.innerHeight;
  const edge = 8;
  const gap = 6;

  // Fixed positioning decouples the detail panel from the draggable capsule's size.
  bodyEl.style.position = 'fixed';
  bodyEl.style.left = `${edge}px`;
  bodyEl.style.top = `${edge}px`;
  bodyEl.style.right = 'auto';
  bodyEl.style.bottom = 'auto';
  bodyEl.style.maxHeight = '28vh';

  const chipRect = chip.getBoundingClientRect();
  const initialBodyRect = bodyEl.getBoundingClientRect();
  const belowSpace = viewportHeight - chipRect.bottom - edge;
  const aboveSpace = chipRect.top - edge;
  const openAbove = belowSpace < initialBodyRect.height && aboveSpace > belowSpace;
  const availableSpace = openAbove ? aboveSpace : belowSpace;
  const fixedBodyHeight = initialBodyRect.height - listEl.getBoundingClientRect().height;

  if (availableSpace < initialBodyRect.height) {
    // Keep the metadata and toolbar intact; the list itself can scroll down to zero height.
    bodyEl.style.maxHeight = `${Math.max(fixedBodyHeight, availableSpace)}px`;
  }

  const bodyRect = bodyEl.getBoundingClientRect();
  const horizontalLeft = Math.min(
    Math.max(edge, chipRect.right - bodyRect.width),
    Math.max(edge, viewportWidth - bodyRect.width - edge)
  );
  let top = openAbove
    ? chipRect.top - gap - bodyRect.height
    : chipRect.bottom + gap;

  // Final clamps cover very short viewports and stale positions after rotation/resize.
  top = Math.min(Math.max(edge, top), Math.max(edge, viewportHeight - bodyRect.height - edge));
  bodyEl.style.left = `${horizontalLeft}px`;
  bodyEl.style.top = `${top}px`;
}

function render() {
  if (!panel || !chipEl || !bodyEl || !listEl) return;
  panel.style.display = enabled ? 'flex' : 'none';
  if (countEl) countEl.textContent = String(entries.length);
  chipEl.title = expanded ? '收起详情' : '展开详情';
  const recordToolBtn = panel.querySelector('[data-toolbar] [data-act="record"]');
  if (recordToolBtn) recordToolBtn.textContent = recording ? '停止并上报' : '标记复现';
  renderRecordButton();
  refreshMeta();
  bodyEl.style.display = expanded ? 'flex' : 'none';
  bodyEl.hidden = !expanded;
  if (expanded) {
    listEl.textContent = entries.length
      ? entries.map((e) => e.text).join('\n')
      : '（尚无记录）';
    listEl.scrollTop = listEl.scrollHeight;
    layoutExpandedBody();
  } else {
    bodyEl.style.maxHeight = '';
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
  if (recording && recordId) record.recId = recordId;
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
  const menu = document.getElementById('settingsButton');
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
    const hit = event.target?.closest?.('#settingsButton');
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
  if (recording) {
    recordEntries.push(entry);
    if (recordEntries.length > MAX_ENTRIES) recordEntries.shift();
  }
  writeConsoleEntry(data, timestamp);
  // Keep count fresh; never auto-expand (covers sheets / IME).
  if (countEl) countEl.textContent = String(entries.length);
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
    dump: dumpText,
    isRecording: () => recording,
    record: () => { startRecording(); render(); },
    stopRecord: () => stopRecording(),
    export: () => exportLogs(),
    recordText: () => recordText
  };

  bindMenuToggle();
}
