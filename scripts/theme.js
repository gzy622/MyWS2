export const THEME_STORAGE_KEY = 'teacher-workbench.theme';

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

export function initTheme() {
  let current = readTheme();

  function render() {
    document.documentElement.dataset.theme = current;
    document.documentElement.style.colorScheme = current;
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
