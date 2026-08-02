const BACKSPACE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 6H9l-6 6 6 6h12zM11 9l6 6m0-6-6 6" /></svg>';

/** Display order for tens keypad: three rows of tens, then 0 + 100. */
export const TENS_SCORE_KEYS = ['10', '20', '30', '40', '50', '60', '70', '80', '90', '0', '100'];

const STANDARD_KEYS = [
  { key: '1' }, { key: '2' }, { key: '3' },
  { key: '4' }, { key: '5' }, { key: '6' },
  { key: '7' }, { key: '8' }, { key: '9' },
  { key: '.' }, { key: '0' },
  { key: 'backspace', label: BACKSPACE_SVG, ariaLabel: '退格' }
];

export function isTensScoreKey(key) {
  return TENS_SCORE_KEYS.includes(key);
}

function buttonHtml({ key, label, ariaLabel }) {
  const aria = ariaLabel ? ` aria-label="${ariaLabel}"` : '';
  return `<button type="button" data-score-key="${key}"${aria}>${label ?? key}</button>`;
}

/**
 * Replace keypad buttons for standard digit entry or one-tap tens entry.
 * @param {HTMLElement} container
 * @param {{ tensMode?: boolean }} [options]
 */
export function renderScoreKeypad(container, { tensMode = false } = {}) {
  if (!container) return;
  container.classList.toggle('student-score-keypad--tens', tensMode);
  if (tensMode) {
    container.innerHTML = TENS_SCORE_KEYS.map((key) => buttonHtml({ key })).join('');
    container.setAttribute('aria-label', '整十数字键盘');
  } else {
    container.innerHTML = STANDARD_KEYS.map(buttonHtml).join('');
    container.setAttribute('aria-label', '数字键盘');
  }
}

/**
 * Sync in-sheet「整十」toggle pressed state and visible label.
 * @param {HTMLElement | null} button
 * @param {boolean} tensMode
 */
export function syncTensToggle(button, tensMode) {
  if (!button) return;
  button.setAttribute('aria-pressed', String(Boolean(tensMode)));
}
