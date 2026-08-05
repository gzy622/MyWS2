import { elements } from './dom.js';
import { state, setCurrentPage, setSubview, toggleSubview } from './state.js';
import { haptic, Haptic } from './haptics.js';
import { setLetterIndexPageDragging, syncLetterIndexPageVisibility } from './letter-index.js';

const STATS_PAGE_INDEX = 2;
const GRADES_SUBVIEW_INDEX = 1;
const REGISTER_PAGE_INDEX = 1;

const navigationSettledListeners = new Set();

let getRegistrationTitle = () => '登记';
let getActiveExamTitle = () => '统计';

export function subscribeNavigationSettled(listener) {
  navigationSettledListeners.add(listener);
  return () => navigationSettledListeners.delete(listener);
}

function notifyNavigationSettled() {
  for (const listener of navigationSettledListeners) listener();
}

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

export function renderTopbarTitle() {
  const isAssignmentTitle = state.currentPage === 1;
  const isExamTitle = state.currentPage === STATS_PAGE_INDEX
    && state.subviews[STATS_PAGE_INDEX] === GRADES_SUBVIEW_INDEX;
  let pageTitle;
  if (isAssignmentTitle) pageTitle = getRegistrationTitle();
  else if (isExamTitle) pageTitle = getActiveExamTitle();
  else pageTitle = elements.pageElements[state.currentPage].getAttribute('aria-label');

  elements.topbarTitleLabel.textContent = pageTitle;
  elements.topbarTitle.classList.toggle('is-assignment', isAssignmentTitle);
  elements.topbarTitle.classList.toggle('is-exam', isExamTitle);
  elements.topbarTitle.disabled = !(isAssignmentTitle || isExamTitle);
  if (isAssignmentTitle) {
    elements.topbarTitle.setAttribute('aria-label', `当前作业：${pageTitle}，点击管理作业`);
  } else if (isExamTitle) {
    elements.topbarTitle.setAttribute('aria-label', `当前考试：${pageTitle}，点击管理考试`);
  } else {
    elements.topbarTitle.setAttribute('aria-label', pageTitle);
  }
}

export function syncQuickScoreModeHint() {
  const active = state.quickScoreMode
    && state.currentPage === REGISTER_PAGE_INDEX
    && !state.seatEditing;
  elements.glider.classList.toggle('nav-glider--quick-score', active);
}

export function renderNavigation({ animate = true } = {}) {
  elements.pages.classList.toggle('dragging', !animate);
  elements.glider.classList.toggle('dragging', !animate);
  elements.pages.style.transform = pageTransform();
  elements.glider.style.transform = gliderTransform();
  renderTopbarTitle();

  elements.navButtons.forEach((button, index) => {
    const isCurrent = index === state.currentPage;
    button.classList.toggle('active', isCurrent);
    if (isCurrent) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  elements.pageElements.forEach((page, pageIndex) => {
    const activeSubview = state.subviews[pageIndex];
    page.querySelectorAll('.segment').forEach((segment, index) => {
      const selected = index === activeSubview;
      segment.classList.toggle('active', selected);
      if (segment.getAttribute('role') === 'tab') {
        segment.setAttribute('aria-selected', String(selected));
      }
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
  syncLetterIndexPageVisibility({ animate });
  syncQuickScoreModeHint();
  notifyNavigationSettled();
}

export function renderDrag(offsetPx) {
  setLetterIndexPageDragging(true);
  elements.pages.classList.add('dragging');
  elements.glider.classList.add('dragging');
  elements.pages.style.transform = pageTransform(offsetPx);
  elements.glider.style.transform = gliderTransform(offsetPx);
}

export function renderNavDrag(offsetPx) {
  setLetterIndexPageDragging(true);
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

export function initNavigation({ getActiveAssignmentTitle, getActiveExamTitle: getExamTitle } = {}) {
  if (typeof getActiveAssignmentTitle === 'function') getRegistrationTitle = getActiveAssignmentTitle;
  if (typeof getExamTitle === 'function') getActiveExamTitle = getExamTitle;
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
