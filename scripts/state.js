export const PAGE_COUNT = 3;

export const state = {
  currentPage: 0,
  subviews: [0, 0, 0],
  suppressNavClick: false,
  drawerOpen: false
};

export function clampPage(index) {
  return Math.max(0, Math.min(PAGE_COUNT - 1, index));
}

export function setCurrentPage(index) {
  state.currentPage = clampPage(index);
}

export function setSubview(pageIndex, subIndex) {
  if (pageIndex < 0 || pageIndex >= PAGE_COUNT) return;
  state.subviews[pageIndex] = subIndex;
}

export function toggleSubview(pageIndex) {
  setSubview(pageIndex, 1 - state.subviews[pageIndex]);
}

export function setSuppressNavClick(value) {
  state.suppressNavClick = value;
}

export function setDrawerOpen(value) {
  state.drawerOpen = value;
}
