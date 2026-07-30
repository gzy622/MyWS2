/**
 * Load content fingerprint shown in the settings page / debug UI / data-twb-build.
 * LAN: /__build-id or /__health (live hash of PC source)
 * APK: /build-id.json (written by sync:www)
 */
export async function loadBuildId() {
  const tries = ['/__build-id', '/__health', '/build-id.json', './build-id.json'];
  for (const url of tries) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.id) return data;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Format ISO time as UTC+8 wall clock, second precision: YYYY-MM-DD HH:mm:ss */
function formatBuildAtUtc8(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return [
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`,
  ].join(' ');
}

function applyBuildId(data) {
  if (typeof document === 'undefined') return;
  const foot = document.getElementById('menuDrawerBuild');
  if (!data?.id) {
    if (foot) {
      foot.hidden = true;
      foot.textContent = '—';
    }
    return;
  }
  document.documentElement.dataset.twbBuild = data.id;
  if (data.at) document.documentElement.dataset.twbBuildAt = data.at;
  if (foot) {
    const stamp = formatBuildAtUtc8(data.at);
    foot.textContent = stamp ? `${data.id} · ${stamp}` : data.id;
    foot.hidden = false;
  }
}

export function refreshBuildId() {
  return loadBuildId().then(applyBuildId);
}

export function initBuildId() {
  refreshBuildId();
}
