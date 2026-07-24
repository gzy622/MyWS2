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
  topbarTitle: required('#topbarTitle'),
  fontSizePopover: required('#fontSizePopover'),
  studentGrid: required('#studentGrid'),
  studentFontSizeInput: required('#studentFontSize'),
  studentFontSizeValue: required('#studentFontSizeValue'),
  seatViewport: required('#seatViewport'),
  seatStage: required('#seatStage'),
  seatGrid: required('#seatGrid'),
  seatHint: required('#seatHint'),
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
  studentRecordOverlay: required('#studentRecordOverlay'),
  studentRecordPanel: required('#studentRecordPanel'),
  studentRecordHandle: required('#studentRecordHandle'),
  closeStudentRecordButton: required('#closeStudentRecord'),
  studentRecordTitle: required('#studentRecordTitle'),
  studentRecordStatus: required('#studentRecordStatus'),
  studentScoreControls: required('#studentScoreControls'),
  studentScoreInput: required('#studentScoreInput'),
  studentScoreError: required('#studentScoreError'),
  clearStudentRecordButton: required('#clearStudentRecord'),
  saveStudentRecordButton: required('#saveStudentRecord'),
  moreOverlay: required('#moreOverlay'),
  moreActions: requiredAll('[data-more-action]'),
  confirmOverlay: required('#confirmOverlay'),
  confirmTitle: required('#confirmTitle'),
  confirmMessage: required('#confirmMessage'),
  cancelConfirmButton: required('#cancelConfirm'),
  acceptConfirmButton: required('#acceptConfirm'),
  menuItems: requiredAll('.menu-item')
};
