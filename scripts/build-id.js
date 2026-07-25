/**
 * Load content fingerprint shown in debug UI / data-twb-build.
 * LAN: /__build-id (live hash of PC source)
 * APK: /build-id.json (written by sync:www)
 */
export async function loadBuildId() {
  const tries = ['__build-id', 'build-id.json'];
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

export function initBuildId() {
  loadBuildId().then((data) => {
    if (!data?.id || typeof document === 'undefined') return;
    document.documentElement.dataset.twbBuild = data.id;
    if (data.at) document.documentElement.dataset.twbBuildAt = data.at;
  });
}
