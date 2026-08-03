import { elements } from './dom.js';

let toastTimer;
let toastReleaseTimer;
const TOAST_VISIBLE_MS = 1600;
const TOAST_FADE_MS = 250;

export function showToast(message) {
  clearTimeout(toastTimer);
  clearTimeout(toastReleaseTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-compositing');
  elements.toast.classList.add('show');
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove('show');
    toastReleaseTimer = setTimeout(() => {
      elements.toast.classList.remove('is-compositing');
    }, TOAST_FADE_MS);
  }, TOAST_VISIBLE_MS);
}
