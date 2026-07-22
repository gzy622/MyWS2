import { elements } from './dom.js';

let toastTimer;

export function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1600);
}

export function initMenuActions() {
  elements.menuItems.forEach((button) => {
    button.addEventListener('click', () => showToast(`${button.dataset.action}功能已选择`));
  });
}
