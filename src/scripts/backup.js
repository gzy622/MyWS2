import {
  cloneRosterState,
  isValidRosterState,
  migrateRosterStateToCurrent
} from './roster-model.js';

export const BACKUP_FORMAT = 'teacher-workbench-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_FILE_SIZE = 1 * 1024 * 1024; // 1MB

/**
 * Wrap a business state snapshot in a backup envelope.
 * The input is deep-cloned so the caller cannot mutate the backup later.
 */
export function createBackup(snapshot) {
  const data = cloneRosterState(snapshot);
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data
  };
}

/**
 * Serialize a backup object to a JSON string.
 */
export function serializeBackup(backup) {
  return JSON.stringify(backup, null, 2) + '\n';
}

/**
 * Generate a standard backup filename with local date-time stamp.
 */
export function generateBackupFilename() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `teacher-workbench-backup-${y}${m}${d}-${h}${min}${s}.json`;
}

/**
 * Parse a raw JSON string into a validated backup.
 *
 * Returns { ok: boolean, error?: string, data?: validated+current-schema roster state }
 *
 * Pure function — no DOM dependency, suitable for node:test.
 */
export function parseBackup(text) {
  if (typeof text !== 'string') {
    return { ok: false, error: '无法读取备份文件' };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '无法读取备份文件' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: '无法读取备份文件' };
  }

  if (parsed.format !== BACKUP_FORMAT) {
    return { ok: false, error: '无法读取备份文件' };
  }

  if (parsed.formatVersion !== BACKUP_FORMAT_VERSION) {
    return { ok: false, error: '暂不支持此备份版本' };
  }

  if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    return { ok: false, error: '备份数据格式不正确' };
  }

  const migrated = migrateRosterStateToCurrent(parsed.data);
  if (!migrated) {
    return { ok: false, error: '备份数据格式不正确' };
  }

  return { ok: true, data: migrated };
}

// ---------------------------------------------------------------------------
// Browser I/O helpers (DOM-dependent)
// ---------------------------------------------------------------------------

/**
 * Open a system file picker restricted to JSON and read the selected file.
 *
 * Returns a Promise of { aborted: true } | { aborted: false, text: string }
 *                                     | { aborted: false, error: string }
 *
 * Cancellation detection listens for window focus after the click() call.
 */
export function openBackupFile(fileInput) {
  return new Promise((resolve) => {
    fileInput.value = '';
    fileInput.accept = '.json,application/json';

    let settled = false;

    function clean() {
      settled = true;
      fileInput.removeEventListener('change', onChange);
      window.removeEventListener('focus', onFocus);
    }

    function onChange() {
      if (settled) return;
      clean();

      const file = fileInput.files?.[0];
      if (!file) {
        resolve({ aborted: true });
        return;
      }

      if (file.size > MAX_BACKUP_FILE_SIZE) {
        resolve({ aborted: false, error: '备份文件过大' });
        return;
      }

      const reader = new FileReader();
      reader.addEventListener('load', () => {
        resolve({ aborted: false, text: reader.result });
      });
      reader.addEventListener('error', () => {
        resolve({ aborted: false, error: '无法读取备份文件' });
      });
      reader.readAsText(file);
    }

    function onFocus() {
      requestAnimationFrame(() => {
        if (!settled) {
          clean();
          resolve({ aborted: true });
        }
      });
    }

    fileInput.addEventListener('change', onChange);
    window.addEventListener('focus', onFocus);
    fileInput.click();
  });
}

/**
 * Create a Blob and trigger an anchor-based download.
 */
export function downloadBackup(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export a JSON backup, trying each strategy in order:
 *
 * 1. Capacitor native           (write file → share via native share sheet)
 * 2. Web Share API with file    (best browser UX: native share sheet with .json)
 * 3. Web Share API text-only    (broader browser compatibility)
 * 4. Blob anchor download       (all browsers / fallback)
 *
 * Returns 'shared' if the user saw a share UI, 'downloaded' if the
 * file was written via Blob download.
 */
export async function shareOrDownloadBackup(text, filename) {
  // 1) Capacitor native — write file to cache, share via native share sheet
  try {
    const Capacitor = globalThis.Capacitor;
    if (Capacitor?.isNativePlatform?.()) {
      const fs = Capacitor.Plugins?.Filesystem;
      const share = Capacitor.Plugins?.Share;
      if (fs?.writeFile && share?.share) {
        const { uri } = await fs.writeFile({
          path: filename,
          data: text,
          directory: 'CACHE',
          recursive: false
        });
        await share.share({
          title: '教师工作台备份',
          url: uri,
          files: [uri],
          dialogTitle: '导出备份'
        });
        return 'shared';
      }
    }
  } catch {
    // Fall through
  }

  // 2) Web Share — file
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const file = new File([blob], filename, { type: 'application/json' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return 'shared';
    }
  } catch (err) {
    if (err.name === 'AbortError') return 'shared';
  }

  // 3) Web Share — text only (wider platform support, no file)
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({
        title: '教师工作台备份',
        text: text.substring(0, 5000)
      });
      return 'shared';
    }
  } catch (err) {
    if (err.name === 'AbortError') return 'shared';
  }

  // 4) Fallback: Blob download
  downloadBackup(text, filename);
  return 'downloaded';
}

// ---------------------------------------------------------------------------
// Initialisation (wires import/export into the app lifecycle)
// ---------------------------------------------------------------------------

/**
 * Initialise the backup feature.
 *
 * @param {object} options
 * @param {import('./roster-store.js').RosterStore} options.store
 * @param {(msg: string) => void} options.showToast
 * @param {(opts: { title: string, message: string, action: () => void }) => void} options.confirm
 * @param {HTMLInputElement} options.fileInput  Hidden <input type="file">
 * @param {() => void} [options.onAfterImport]  Callback after a successful import (e.g. reset seat canvas)
 */
export function initBackup({ store, showToast, confirm, fileInput, onAfterImport } = {}) {
  let importing = false;
  let exporting = false;

  async function exportBackup() {
    if (exporting) return;
    exporting = true;

    try {
      const snapshot = store.getSnapshot();
      const backup = createBackup(snapshot);
      const json = serializeBackup(backup);
      const filename = generateBackupFilename();
      const result = await shareOrDownloadBackup(json, filename);
      if (result === 'downloaded') {
        showToast('备份已保存');
      } else {
        showToast('备份已导出');
      }
    } catch {
      showToast('导出备份失败');
    } finally {
      exporting = false;
    }
  }

  async function importBackup() {
    if (importing) return;
    importing = true;

    try {
      const result = await openBackupFile(fileInput);

      if (result.aborted) return;

      if (result.error) {
        showToast(result.error);
        return;
      }

      const parsed = parseBackup(result.text);
      if (!parsed.ok) {
        showToast(parsed.error);
        return;
      }

      confirm({
        title: '导入备份',
        message: '导入后将替换当前所有业务数据，此操作不可撤销。',
        action: () => {
          const replaceResult = store.replaceSnapshot(parsed.data);
          if (replaceResult === 'replaced') {
            showToast('备份已导入');
            onAfterImport?.();
          } else if (replaceResult === 'persist-failed') {
            showToast('备份导入失败，无法保存');
          } else {
            showToast('备份数据格式不正确');
          }
        }
      });
    } finally {
      importing = false;
    }
  }

  return { exportBackup, importBackup };
}
