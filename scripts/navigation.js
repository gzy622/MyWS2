import { elements } from './dom.js';
import { state, setCurrentPage, setSubview, toggleSubview } from './state.js';
import { haptic, Haptic } from './haptics.js';
import { syncLetterIndexPageVisibility } from './letter-index.js';

let getRegistrationTitle = () => '登记';

function pageTransform(offsetPx = 0) {
  return `translate3d(calc(${-state.currentPage * 100 / 3}% + ${offsetPx}px), 0, 0)`;
}

function gliderTransform(offsetPx = 0) {
  return `translate3d(calc(${state.currentPage * 100}% + ${-offsetPx / 3}px), 0, 0)`;
}

function directGliderTransform(offsetPx = 0) {
  return `translate3d(calc(${state.currentPage * 100}% + ${offsetPx}px), 0, 0)`;
}

function segmentGliderTransform(subIndex, offsetPx = 0) {
  return `translate3d(calc(${subIndex * 100}% + ${offsetPx}px), 0, 0)`;
}

export function renderNavigation({ animate = true } = {}) {
  elements.pages.classList.toggle('dragging', !animate);
  elements.glider.classList.toggle('dragging', !animate);
  elements.pages.style.transform = pageTransform();
  elements.glider.style.transform = gliderTransform();
  const isAssignmentTitle = state.currentPage === 1;
  const pageTitle = isAssignmentTitle
    ? getRegistrationTitle()
    : elements.pageElements[state.currentPage].getAttribute('aria-label');
  elements.topbarTitleLabel.textContent = pageTitle;
  elements.topbarTitle.classList.toggle('is-assignment', isAssignmentTitle);
  elements.topbarTitle.setAttribute(
    'aria-label',
    isAssignmentTitle ? `当前作业：${pageTitle}，点击管理作业` : pageTitle
  );

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
    const segmentGlider = page.querySelector('.segment-glider');
    if (segmentGlider) {
      segmentGlider.classList.toggle('dragging', !animate);
      segmentGlider.style.transform = segmentGliderTransform(activeSubview);
    }
    page.querySelectorAll('.subview').forEach((view, index) => {
      view.classList.toggle('active', index === activeSubview);
    });
    elements.navButtons[pageIndex].querySelectorAll('.subdots i').forEach((dot, index) => {
      dot.classList.toggle('on', index === activeSubview);
    });
  });
  syncLetterIndexPageVisibility();
}

export function renderDrag(offsetPx) {
  elements.pages.classList.add('dragging');
  elements.glider.classList.add('dragging');
  elements.pages.style.transform = pageTransform(offsetPx);
  elements.glider.style.transform = gliderTransform(offsetPx);
}

export function renderNavDrag(offsetPx) {
  const segmentWidth = elements.glider.offsetWidth || elements.nav.clientWidth / elements.navButtons.length;
  const pageOffset = segmentWidth > 0
    ? -offsetPx * elements.viewport.clientWidth / segmentWidth
    : 0;
  elements.pages.classList.add('dragging');
  elements.glider.classList.add('dragging');
  elements.pages.style.transform = pageTransform(pageOffset);
  elements.glider.style.transform = directGliderTransform(offsetPx);
}

export function renderSegmentDrag(offsetPx) {
  const page = elements.pageElements[state.currentPage];
  const glider = page?.querySelector('.segment-glider');
  if (!glider) return;
  glider.classList.add('dragging');
  glider.style.transform = segmentGliderTransform(state.subviews[state.currentPage], offsetPx);
}

export function getSegmentGliderWidth(pageIndex = state.currentPage) {
  const page = elements.pageElements[pageIndex];
  const glider = page?.querySelector('.segment-glider');
  if (glider?.offsetWidth) return glider.offsetWidth;
  const track = page?.querySelector('.segments');
  return track ? Math.max(1, (track.clientWidth - 4) / 2) : 1;
}

export function setPage(index) {
  setCurrentPage(index);
  renderNavigation();
}

export function setSub(pageIndex, subIndex) {
  setSubview(pageIndex, subIndex);
  renderNavigation();
}

export function initNavigation({ getActiveAssignmentTitle } = {}) {
  if (typeof getActiveAssignmentTitle === 'function') getRegistrationTitle = getActiveAssignmentTitle;
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
      haptic(Haptic.light);
    });
  });
}
