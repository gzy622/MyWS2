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
  gridLetterIndex: required('#gridLetterIndex'),
  studentFontSizeInput: required('#studentFontSize'),
  studentFontSizeValue: required('#studentFontSizeValue'),
  seatViewport: required('#seatViewport'),
  seatStage: required('#seatStage'),
  seatGrid: required('#seatGrid'),
  seatFitButton: required('#seatFitButton'),
  seatLandscapeButton: required('#seatLandscapeButton'),
  seatModeBar: required('#seatModeBar'),
  seatEditStatus: required('#seatEditStatus'),
  exitSeatEditButton: required('#exitSeatEdit'),
  seatLetterIndex: required('#seatLetterIndex'),
  peopleCard: required('#peopleCard'),
  roleList: required('#roleList'),
  dutyList: required('#dutyList'),
  weekStrip: required('#weekStrip'),
  gradeTable: required('#gradeTable'),
  assignmentSummary: required('#assignmentSummary'),
  navButtons: requiredAll('.nav-btn'),
  pageElements: requiredAll('.page'),
  menuDrawer: required('#menuDrawer'),
  settingsButton: required('#settingsButton'),
  moreButton: required('#moreButton'),
  closeMenuDrawerButton: required('#closeMenuDrawer'),
  toast: required('#toast'),
  studentRecordSheet: required('#studentRecordSheet'),
  studentRecordPanel: required('#studentRecordPanel'),
  studentRecordHandle: required('#studentRecordHandle'),
  studentRecordTitle: required('#studentRecordTitle'),
  closeStudentRecordButton: required('#closeStudentRecord'),
  studentRecordStatus: required('#studentRecordStatus'),
  studentScoreControls: required('#studentScoreControls'),
  studentScoreTensToggle: required('#studentScoreTensToggle'),
  studentScoreInput: required('#studentScoreInput'),
  studentScoreError: required('#studentScoreError'),
  cancelStudentRecordButton: required('#cancelStudentRecord'),
  saveStudentRecordButton: required('#saveStudentRecord'),
  moreMenu: required('#moreMenu'),
  moreMenuPanel: required('#moreMenuPanel'),
  moreMenuHandle: required('#moreMenuHandle'),
  closeMoreMenuButton: required('#closeMoreMenu'),
  moreActions: requiredAll('[data-more-action]'),
  confirmSheet: required('#confirmSheet'),
  confirmTitle: required('#confirmTitle'),
  confirmMessage: required('#confirmMessage'),
  cancelConfirmButton: required('#cancelConfirm'),
  acceptConfirmButton: required('#acceptConfirm'),
  menuItems: requiredAll('.menu-item')
};
