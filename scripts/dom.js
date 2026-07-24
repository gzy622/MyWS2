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
  topbarTitleLabel: required('#topbarTitleLabel'),
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
  menuDrawer: required('#menuDrawer'),
  menuDrawerHandle: required('#menuDrawerHandle'),
  gestureTip: required('#gestureTip'),
  menuButton: required('#menuButton'),
  moreButton: required('#moreButton'),
  closeMenuDrawerButton: required('#closeMenuDrawer'),
  scrim: required('#scrim'),
  toast: required('#toast'),
  studentRecordSheet: required('#studentRecordSheet'),
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
  moreMenu: required('#moreMenu'),
  moreActions: requiredAll('[data-more-action]'),
  confirmSheet: required('#confirmSheet'),
  confirmTitle: required('#confirmTitle'),
  confirmMessage: required('#confirmMessage'),
  cancelConfirmButton: required('#cancelConfirm'),
  acceptConfirmButton: required('#acceptConfirm'),
  menuItems: requiredAll('.menu-item')
};
