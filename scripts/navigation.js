import { elements } from './dom.js';
import { state, setCurrentPage, setSubview, toggleSubview } from './state.js';

function pageTransform(offsetPx = 0) {
  return `translate3d(calc(${-state.currentPage * 100 / 3}% + ${offsetPx}px), 0, 0)`;
}

function gliderTransform(offsetPx = 0) {
  return `translate3d(calc(${state.currentPage * 100}% + ${-offsetPx / 3}px), 0, 0)`;
}

export function renderNavigation({ animate = true } = {}) {
  elements.pages.classList.toggle('dragging', !animate);
  elements.glider.classList.toggle('dragging', !animate);
  elements.pages.style.transform = pageTransform();
  elements.glider.style.transform = gliderTransform();

  elements.navButtons.forEach((button, index) => {
    const isCurrent = index === state.currentPage;
    button.classList.toggle('active', isCurrent);
    if (isCurrent) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  elements.pageElements.forEach((page, pageIndex) => {
    const activeSubview = state.subviews[pageIndex];
    page.querySelectorAll('.segment').forEach((segment, index) => {
      segment.classList.toggle('active', index === activeSubview);
    });
    page.querySelectorAll('.subview').forEach((view, index) => {
      view.classList.toggle('active', index === activeSubview);
    });
    elements.navButtons[pageIndex].querySelectorAll('.subdots i').forEach((dot, index) => {
      dot.classList.toggle('on', index === activeSubview);
    });
  });
}

export function renderDrag(offsetPx) {
  elements.pages.classList.add('dragging');
  elements.glider.classList.add('dragging');
  elements.pages.style.transform = pageTransform(offsetPx);
  elements.glider.style.transform = gliderTransform(offsetPx);
}

export function setPage(index) {
  setCurrentPage(index);
  renderNavigation();
}

export function setSub(pageIndex, subIndex) {
  setSubview(pageIndex, subIndex);
  renderNavigation();
}

export function initNavigation() {
  elements.pageElements.forEach((page, pageIndex) => {
    page.querySelectorAll('.segment').forEach((button, subIndex) => {
      button.addEventListener('click', () => setSub(pageIndex, subIndex));
    });
  });

  elements.navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (state.suppressNavClick) return;
      const target = Number(button.dataset.index);
      if (target === state.currentPage) {
        toggleSubview(state.currentPage);
        renderNavigation();
      } else {
        setPage(target);
      }
    });
  });
}
