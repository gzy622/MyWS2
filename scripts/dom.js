function required(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Required DOM element not found: ${selector}`);
  return element;
}

function requiredAll(selector) {
  const elements = [...document.querySelectorAll(selector)];
  if (!elements.length) throw new Error(`Required DOM elements not found: ${selector}`);
  return elements;
}

export const elements = {
  app: required('#app'),
  viewport: required('#viewport'),
  pages: required('#pages'),
  nav: required('#nav'),
  glider: required('#glider'),
  navButtons: requiredAll('.nav-btn'),
  pageElements: requiredAll('.page'),
  drawer: required('#drawer'),
  drawerHandle: required('#drawerHandle'),
  gestureTip: required('#gestureTip'),
  menuButton: required('#menuButton'),
  moreButton: required('#moreButton'),
  closeDrawerButton: required('#closeDrawer'),
  scrim: required('#scrim'),
  toast: required('#toast'),
  menuItems: requiredAll('.menu-item')
};
