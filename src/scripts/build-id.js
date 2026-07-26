/**
 * Load content fingerprint shown in menu drawer foot / debug UI / data-twb-build.
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

function applyBuildId(data) {
  if (!data?.id || typeof document === 'undefined') return;
  document.documentElement.dataset.twbBuild = data.id;
  if (data.at) document.documentElement.dataset.twbBuildAt = data.at;
  const foot = document.getElementById('menuDrawerBuild');
  if (foot) foot.textContent = `版本 ${data.id}`;
}

export function refreshBuildId() {
  return loadBuildId().then(applyBuildId);
}

export function initBuildId() {
  refreshBuildId();
}
