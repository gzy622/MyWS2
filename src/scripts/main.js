import { elements } from './dom.js';
import {
  initNavigation,
  renderNavigation,
  subscribeNavigationSettled,
  whenPagesTransitionSettled,
} from './navigation.js';
import { state } from './state.js';
import { initHorizontalGestures, cancelActivePointerGesture } from './gestures.js';
import { closeDrawer, initDrawer } from './drawer.js';
import { showToast } from './toast.js';
import { initStudentFontSize } from './student-font-size.js';
import { initSeatCanvas } from './seat-canvas.js';
import { initSeatLandscape } from './seat-landscape.js';
import { createRosterStore } from './roster-store.js';
import { initRosterRenderer } from './roster-renderer.js';
import { initPeopleRenderer } from './people-renderer.js';
import { initPeopleInteractions } from './people-interactions.js';
import { initCoursesRenderer, resolveGradeExamId } from './courses-renderer.js';
import { initSummaryRenderer } from './summary-renderer.js';
import { initCoursesInteractions } from './courses-interactions.js';
import { initExams } from './exams.js';
import { initHighlightSubjects } from './highlight-subjects.js';
import { initStudentInteractions } from './student-interactions.js';
import { initStudentRecord } from './student-record.js';
import { initAssignments } from './assignments.js';
import { initRosterEditor } from './roster-editor.js';
import { initMoreSheet } from './more-sheet.js';
import { initBackup } from './backup.js';
import { loadRosterState, saveRosterState } from './roster-storage.js';
import { initTheme } from './theme.js';
import { initViewport } from './viewport.js';
import { createSystemBackController } from './system-back.js';
import { initSheetDebug } from './sheet-debug.js';
import { initBuildId } from './build-id.js';
import { initLetterIndex } from './letter-index.js';
import { initScrollThinChrome } from './scroll-thin.js';
import { isOverlayId } from './overlay-stack.js';

export const rosterStore = createRosterStore(loadRosterState(), saveRosterState);
const theme = initTheme();
const appViewport = initViewport({ app: elements.app, studentGrid: elements.studentGrid });
initBuildId();
initSheetDebug();

initNavigation({
  getActiveAssignmentTitle: () => rosterStore.getCurrentAssignment().name,
  getActiveExamTitle: () => {
    const snapshot = rosterStore.getSnapshot();
    const examId = resolveGradeExamId(snapshot);
    return snapshot.exams.find((exam) => exam.id === examId)?.title ?? '统计';
  },
});
const fontSize = initStudentFontSize();
const rosterRenderer = initRosterRenderer(rosterStore);
initLetterIndex(rosterStore);
const peopleRenderer = initPeopleRenderer(rosterStore);
const summaryRenderer = initSummaryRenderer(rosterStore);
let studentRecord;
let assignments;
let rosterEditor;
let exams;
let moreSheet;
let people;
let courses;
let highlightSubjects;
let coursesRenderer;
let deferredFirstPaintToken = 0;
/** @type {(() => void) | null} */
let cancelPagesSettleWait = null;
/** Tracks last page used for nav paint gating (subview-only skips pages wait). */
let lastNavPaintPage = state.currentPage;
let peopleDirty = true;
let summaryDirty = true;

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/** Reveal a deferred business host once after opacity:0 has been painted. */
function revealBusinessViewHost(host) {
  if (!(host instanceof HTMLElement) || host.classList.contains('is-ready')) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      host.classList.add('is-ready');
    });
  });
}

/** Offscreen warm: mark hosts displayable without a user-visible fade. */
function markDeferredHostsReady() {
  for (const host of [
    elements.peopleCard,
    elements.weekStrip,
    elements.assignmentSummary,
    elements.gradeTable,
  ]) {
    if (host instanceof HTMLElement) host.classList.add('is-ready');
  }
}

function hostForVisibleBusinessView(page = state.currentPage, subview = state.subviews[page]) {
  if (page === 0 && subview === 0) return elements.peopleCard;
  if (page === 0 && subview === 1) return elements.weekStrip;
  if (page === 2 && subview === 0) return elements.assignmentSummary;
  if (page === 2 && subview === 1) return elements.gradeTable;
  return null;
}

function paintVisibleBusinessView(snapshot = rosterStore.getSnapshot()) {
  const page = state.currentPage;
  const subview = state.subviews[page];

  coursesRenderer.render(snapshot);
  if (page === 0 && subview === 0) {
    if (peopleDirty || !hostLooksFilled(elements.peopleCard)) {
      peopleRenderer.render(snapshot);
      peopleDirty = false;
    }
    revealBusinessViewHost(elements.peopleCard);
  } else if (page === 0 && subview === 1) {
    revealBusinessViewHost(elements.weekStrip);
  } else if (page === 1) {
    rosterRenderer.render(snapshot);
  } else if (page === 2 && subview === 0) {
    if (summaryDirty || !hostLooksFilled(elements.assignmentSummary)) {
      summaryRenderer.render(snapshot);
      summaryDirty = false;
    }
    revealBusinessViewHost(elements.assignmentSummary);
  } else if (page === 2 && subview === 1) {
    revealBusinessViewHost(elements.gradeTable);
  }
}

function cancelDeferredFirstPaint() {
  deferredFirstPaintToken += 1;
  cancelPagesSettleWait?.();
  cancelPagesSettleWait = null;
}

function hostLooksFilled(host) {
  if (!(host instanceof HTMLElement)) return false;
  if (host === elements.peopleCard) return Boolean(host.querySelector('.people-row'));
  if (host === elements.weekStrip) return Boolean(host.querySelector('.week-matrix'));
  if (host === elements.assignmentSummary || host === elements.gradeTable) {
    return Boolean(host.querySelector('.grade-scroll'));
  }
  return false;
}

/**
 * After `#pages` transform settles (or instantly for subview-only / reduced motion).
 * @param {number} page
 * @param {number} subview
 * @param {() => void} callback
 * @param {{ instant?: boolean }} [options]
 */
function scheduleAfterPagesSettle(page, subview, callback, { instant = false } = {}) {
  const token = ++deferredFirstPaintToken;
  cancelPagesSettleWait?.();
  cancelPagesSettleWait = whenPagesTransitionSettled(() => {
    cancelPagesSettleWait = null;
    if (token !== deferredFirstPaintToken) return;
    if (state.currentPage !== page || state.subviews[page] !== subview) return;
    callback();
  }, { instant: instant || prefersReducedMotion() });
}

/**
 * Store updates paint immediately. Navigation never does heavy DOM in the same
 * turn as starting the pages transform: fully warmed hosts only refresh after
 * settle; true cold hosts paint+fade after settle; half-warm only reveals.
 */
function renderVisibleBusinessView(snapshot = rosterStore.getSnapshot(), { fromNavigation = false } = {}) {
  if (!fromNavigation) {
    cancelDeferredFirstPaint();
    paintVisibleBusinessView(snapshot);
    return;
  }

  const page = state.currentPage;
  const subview = state.subviews[page];
  const host = hostForVisibleBusinessView(page, subview);
  const pagesMoved = page !== lastNavPaintPage;
  lastNavPaintPage = page;

  // Register page is startup-eager; keep it sync so roster stays current.
  if (!host) {
    cancelDeferredFirstPaint();
    paintVisibleBusinessView(snapshot);
    return;
  }

  const instant = !pagesMoved || prefersReducedMotion();

  if (host.classList.contains('is-ready')) {
    // Fully warm: defer dirty refresh + grade scroll chrome past the slide.
    scheduleAfterPagesSettle(page, subview, () => paintVisibleBusinessView(), { instant });
    return;
  }

  if (hostLooksFilled(host)) {
    // Half-warm: reveal only — no replaceChildren on the nav critical path.
    scheduleAfterPagesSettle(page, subview, () => {
      coursesRenderer.render(rosterStore.getSnapshot());
      revealBusinessViewHost(host);
    }, { instant });
    return;
  }

  // True cold: release hidden grade chrome cheaply, paint after transform settle.
  if (page !== 2 || subview !== 1) coursesRenderer.render(snapshot);
  scheduleAfterPagesSettle(page, subview, () => paintVisibleBusinessView(), { instant });
}

function warmDeferredBusinessViews() {
  const snapshot = rosterStore.getSnapshot();
  peopleRenderer.render(snapshot);
  peopleDirty = false;
  summaryRenderer.render(snapshot);
  summaryDirty = false;
  coursesRenderer.warm(snapshot);
  // Offscreen pages are clipped by #viewport; mark displayable so first nav
  // only runs transform (ViewPager-style), with no sync rebuild or fade.
  markDeferredHostsReady();
}

function scheduleWarmDeferredBusinessViews() {
  const run = () => {
    try {
      warmDeferredBusinessViews();
    } catch {
      // Warm is best-effort; first visit still paints via deferred cold path.
    }
  };
  const arm = () => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 900 });
    } else {
      window.setTimeout(run, 240);
    }
  };
  // Let startup first paint commit before arming idle warm.
  requestAnimationFrame(() => {
    requestAnimationFrame(arm);
  });
}

function closeOverlays(except) {
  const candidates = Array.isArray(except) ? except : [except];
  const keep = new Set(candidates.filter(isOverlayId));
  if (!keep.has('people-pick')) people?.closePick({ restoreFocus: false });
  if (!keep.has('people-edit')) people?.closeEdit({ restoreFocus: false });
  if (!keep.has('course-slot')) courses?.closeSlot({ restoreFocus: false });
  if (!keep.has('course-period')) courses?.closePeriod({ restoreFocus: false });
  if (!keep.has('course-subject')) courses?.closeSubject({ restoreFocus: false });
  if (!keep.has('course-grade')) courses?.closeGrade({ restoreFocus: false });
  if (!keep.has('course-stats')) courses?.closeStats({ restoreFocus: false });
  if (!keep.has('course-highlight')) highlightSubjects?.close({ restoreFocus: false });
  if (!keep.has('student-record')) studentRecord?.close();
  if (!keep.has('assignments')) assignments?.close();
  if (!keep.has('roster-editor') && !keep.has('confirm')) rosterEditor?.close();
  if (!keep.has('exams')) exams?.close();
  if (!keep.has('more')) moreSheet?.close({ restoreFocus: false });
  if (!keep.has('confirm')) moreSheet?.closeConfirm({ restoreFocus: false });
  if (!keep.has('font-size')) fontSize.close();
  if (!keep.has('drawer')) closeDrawer({ restoreFocus: false });
}
highlightSubjects = initHighlightSubjects({
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
});
coursesRenderer = initCoursesRenderer(rosterStore, highlightSubjects);
renderVisibleBusinessView();
rosterStore.subscribe((snapshot) => {
  peopleDirty = true;
  summaryDirty = true;
  coursesRenderer.invalidateWarm();
  renderVisibleBusinessView(snapshot);
});
studentRecord = initStudentRecord({ store: rosterStore, showToast, viewport: appViewport, closeOthers: closeOverlays });
assignments = initAssignments({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
});
rosterEditor = initRosterEditor({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
});
exams = initExams({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
  onGradesUiChange: () => renderVisibleBusinessView(),
});
initStudentInteractions({ store: rosterStore, showToast, openStudentRecord: studentRecord.open });
export const seatCanvas = initSeatCanvas({ store: rosterStore, showToast, openStudentRecord: studentRecord.open });
const seatLandscape = initSeatLandscape({ seatCanvas, showToast });
const transferFileInput = document.getElementById('backupFileInput');
const afterDataReplace = () => {
  seatCanvas?.reset();
};
const backup = initBackup({
  store: rosterStore,
  showToast,
  confirm: (...args) => moreSheet.confirm(...args),
  fileInput: transferFileInput,
  onAfterImport: afterDataReplace
});
let workbookTransferPromise;
function ensureWorkbookTransfer() {
  workbookTransferPromise ??= import('./workbook-transfer.js')
    .then(({ initWorkbookTransfer }) => initWorkbookTransfer({
      store: rosterStore,
      showToast,
      confirm: (...args) => moreSheet.confirm(...args),
      fileInput: transferFileInput,
      onAfterImport: afterDataReplace,
    }))
    .catch((error) => {
      workbookTransferPromise = undefined;
      throw error;
    });
  return workbookTransferPromise;
}
async function runWorkbookAction(method, failureMessage) {
  try {
    const transfer = await ensureWorkbookTransfer();
    await transfer[method]();
  } catch {
    showToast(failureMessage);
  }
}

moreSheet = initMoreSheet({
  store: rosterStore,
  showToast,
  seatCanvas,
  fontSize,
  theme,
  closeOthers: closeOverlays,
  highlightSubjects,
  openCreateAssignment: (options) => assignments.openCreate(options),
  openCreateExam: (options) => exams.openCreate(options),
  openGradeStats: (...args) => courses?.openStats(...args),
  onQuickScoreChange: () => renderVisibleBusinessView(),
});
people = initPeopleInteractions({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
});
courses = initCoursesInteractions({
  store: rosterStore,
  showToast,
  viewport: appViewport,
  closeOthers: closeOverlays,
  confirm: (...args) => moreSheet.confirm(...args),
  onGradesUiChange: () => renderVisibleBusinessView(),
});
initDrawer({
  closeOverlays,
  theme,
  showToast,
  onBackupImport: () => backup.importBackup(),
  onBackupExport: () => backup.exportBackup(),
  onWorkbookImport: () => runWorkbookAction('importWorkbook', '导入表格失败'),
  onWorkbookExport: () => runWorkbookAction('exportWorkbook', '导出表格失败'),
  onEditRoster: (options) => rosterEditor.open({ ...options, preserveDrawer: true }),
});
initHorizontalGestures({ closeRosterEditor: () => rosterEditor.close() });
createSystemBackController({
  beforeDismiss: () => cancelActivePointerGesture('system-back'),
  closeConfirm: () => moreSheet.closeConfirm(),
  dismissPeople: () => people.dismissBack(),
  dismissCourses: () => highlightSubjects.dismissBack() || exams.dismissBack() || courses.dismissBack(),
  dismissAssignments: () => assignments.dismissBack(),
  dismissRosterEditor: () => rosterEditor.dismissBack(),
  closeStudentRecord: () => studentRecord.close(),
  closeMore: () => moreSheet.close(),
  closeFontSize: () => fontSize.close(),
  closeDrawer: () => closeDrawer(),
  exitSeatLandscape: () => seatLandscape.exit(),
});
initScrollThinChrome();
renderNavigation({ animate: false });
subscribeNavigationSettled(() => {
  renderVisibleBusinessView(rosterStore.getSnapshot(), { fromNavigation: true });
});
scheduleWarmDeferredBusinessViews();
