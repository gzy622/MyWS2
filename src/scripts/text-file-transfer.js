export const MAX_TEXT_FILE_SIZE = 1 * 1024 * 1024; // 1MB
export const MAX_BINARY_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Open a system file picker and read the selected text file.
 *
 * Returns a Promise of { aborted: true }
 *   | { aborted: false, text: string }
 *   | { aborted: false, error: string }
 *
 * Cancellation detection listens for window focus after the click() call.
 */
export function openTextFile(fileInput, {
  accept,
  maxSize = MAX_TEXT_FILE_SIZE,
  tooLargeError = '文件过大',
  readError = '无法读取文件'
} = {}) {
  return new Promise((resolve) => {
    fileInput.value = '';
    if (accept) fileInput.accept = accept;

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

      if (file.size > maxSize) {
        resolve({ aborted: false, error: tooLargeError });
        return;
      }

      const reader = new FileReader();
      reader.addEventListener('load', () => {
        resolve({ aborted: false, text: reader.result });
      });
      reader.addEventListener('error', () => {
        resolve({ aborted: false, error: readError });
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

/** Open a system file picker and read one binary file. */
export function openBinaryFile(fileInput, {
  accept,
  maxSize = MAX_BINARY_FILE_SIZE,
  tooLargeError = '文件过大',
  readError = '无法读取文件'
} = {}) {
  return new Promise((resolve) => {
    fileInput.value = '';
    if (accept) fileInput.accept = accept;

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
      if (file.size > maxSize) {
        resolve({ aborted: false, error: tooLargeError });
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        resolve({
          aborted: false,
          buffer: reader.result,
          filename: file.name,
          mimeType: file.type
        });
      });
      reader.addEventListener('error', () => resolve({ aborted: false, error: readError }));
      reader.readAsArrayBuffer(file);
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
export function downloadTextFile(text, filename, mimeType = 'text/plain;charset=utf-8') {
  downloadBlobFile(new Blob([text], { type: mimeType }), filename);
}

/** Create a temporary download link for a complete Blob. */
export function downloadBlobFile(blob, filename) {
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

function isNativePlatform() {
  try {
    return Boolean(globalThis.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Encode text as UTF-8 base64 for Capacitor Filesystem binary writes. */
function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

function encodeBytesBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

/**
 * Write a text file into the native cache and return its shareable URI.
 * Prefer UTF-8 string writes; fall back to base64 so BOM/CRLF/CSV stay intact.
 */
async function writeNativeCacheFile(fs, filename, text) {
  try {
    const result = await fs.writeFile({
      path: filename,
      data: text,
      directory: 'CACHE',
      encoding: 'utf8',
      recursive: true
    });
    if (result?.uri) return result.uri;
  } catch {
    // Fall through to base64 write
  }

  const result = await fs.writeFile({
    path: filename,
    data: encodeUtf8Base64(text),
    directory: 'CACHE',
    recursive: true
  });
  if (!result?.uri) {
    throw new Error('native-write-missing-uri');
  }
  return result.uri;
}

async function writeNativeBinaryCacheFile(fs, filename, bytes) {
  const result = await fs.writeFile({
    path: filename,
    data: encodeBytesBase64(bytes),
    directory: 'CACHE',
    recursive: true
  });
  if (!result?.uri) throw new Error('native-write-missing-uri');
  return result.uri;
}

/**
 * Export a text file with the same strategy for JSON backup and CSV:
 *
 * 1. Capacitor native (write file → share via native share sheet)
 * 2. Blob anchor download of the complete file (browser)
 *
 * Browser Web Share is skipped so CSV/JSON stay on one reliable path.
 * Native writes always use UTF-8 (string or base64), required for CSV BOM.
 *
 * Returns 'shared' | 'downloaded' | 'aborted'
 */
export async function shareOrDownloadText(text, filename, {
  mimeType = 'text/plain;charset=utf-8',
  shareTitle = '教师工作台',
  dialogTitle = '导出文件'
} = {}) {
  if (isNativePlatform()) {
    try {
      const Capacitor = globalThis.Capacitor;
      const fs = Capacitor.Plugins?.Filesystem;
      const share = Capacitor.Plugins?.Share;
      if (fs?.writeFile && share?.share) {
        const uri = await writeNativeCacheFile(fs, filename, text);
        await share.share({
          title: shareTitle,
          url: uri,
          files: [uri],
          dialogTitle
        });
        return 'shared';
      }
    } catch (err) {
      if (err?.name === 'AbortError') return 'aborted';
      // Native WebView Blob downloads are unreliable; surface failure to caller.
      throw err;
    }
  }

  downloadTextFile(text, filename, mimeType);
  return 'downloaded';
}

/** Export a binary file through the native share sheet or a browser download. */
export async function shareOrDownloadBytes(bytes, filename, {
  mimeType = 'application/octet-stream',
  shareTitle = '教师工作台',
  dialogTitle = '导出文件'
} = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (isNativePlatform()) {
    try {
      const Capacitor = globalThis.Capacitor;
      const fs = Capacitor.Plugins?.Filesystem;
      const share = Capacitor.Plugins?.Share;
      if (fs?.writeFile && share?.share) {
        const uri = await writeNativeBinaryCacheFile(fs, filename, data);
        await share.share({ title: shareTitle, url: uri, files: [uri], dialogTitle });
        return 'shared';
      }
    } catch (err) {
      if (err?.name === 'AbortError') return 'aborted';
      throw err;
    }
  }
  downloadBlobFile(new Blob([data], { type: mimeType }), filename);
  return 'downloaded';
}
