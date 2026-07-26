export const THEME_STORAGE_KEY = 'teacher-workbench.theme';

const THEME_COLORS = Object.freeze({
  light: '#f2f2f4',
  dark: '#111214',
});

function readTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Keep the current in-memory theme when storage is unavailable.
  }
}

function syncThemeColorMeta(theme) {
  const color = THEME_COLORS[theme] || THEME_COLORS.light;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.append(meta);
  }
  meta.setAttribute('content', color);
}

function syncNativeStatusBar(theme) {
  const Capacitor = globalThis.Capacitor;
  if (!Capacitor?.isNativePlatform?.()) return;
  const StatusBar = Capacitor.Plugins?.StatusBar;
  if (!StatusBar) return;

  const color = THEME_COLORS[theme] || THEME_COLORS.light;
  // Capacitor Style.Light => dark icons (for light backgrounds)
  // Capacitor Style.Dark => light icons (for dark backgrounds)
  const style = theme === 'dark' ? 'DARK' : 'LIGHT';
  Promise.resolve(StatusBar.setBackgroundColor({ color })).catch(() => {});
  Promise.resolve(StatusBar.setStyle({ style })).catch(() => {});
  if (StatusBar.show) Promise.resolve(StatusBar.show()).catch(() => {});
}

export function initTheme() {
  let current = readTheme();

  function render() {
    document.documentElement.dataset.theme = current;
    document.documentElement.style.colorScheme = current;
    syncThemeColorMeta(current);
    syncNativeStatusBar(current);
  }

  function set(theme) {
    current = theme === 'dark' ? 'dark' : 'light';
    render();
    persistTheme(current);
    return current;
  }

  render();
  return {
    get: () => current,
    set,
    toggle: () => set(current === 'dark' ? 'light' : 'dark')
  };
}
