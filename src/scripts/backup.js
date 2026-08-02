import {
  cloneRosterState,
  migrateRosterStateToCurrent
} from './roster-model.js';
import {
  openTextFile,
  downloadTextFile,
  shareOrDownloadText,
  MAX_TEXT_FILE_SIZE
} from './text-file-transfer.js';

export const BACKUP_FORMAT = 'teacher-workbench-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_FILE_SIZE = MAX_TEXT_FILE_SIZE;

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

/**
 * Open a system file picker restricted to JSON and read the selected file.
 */
export function openBackupFile(fileInput) {
  return openTextFile(fileInput, {
    accept: '.json,application/json',
    maxSize: MAX_BACKUP_FILE_SIZE,
    tooLargeError: '备份文件过大',
    readError: '无法读取备份文件'
  });
}

/**
 * Create a Blob and trigger an anchor-based download.
 */
export function downloadBackup(text, filename) {
  downloadTextFile(text, filename, 'application/json');
}

/**
 * Export a JSON backup via native share or full Blob download.
 * Same strategy as CSV export (`shareOrDownloadText`).
 */
export async function shareOrDownloadBackup(text, filename) {
  return shareOrDownloadText(text, filename, {
    mimeType: 'application/json',
    shareTitle: '教师工作台备份',
    dialogTitle: '导出备份'
  });
}

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
      if (result === 'aborted') return;
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
