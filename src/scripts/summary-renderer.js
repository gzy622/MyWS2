import { elements } from './dom.js';
import { state, setSummarySort } from './state.js';
import { bindGradeScrollChrome } from './scroll-thin.js';

/**
 * 登记汇总：学生 × 作业的只读矩阵（统计页「作业」子视图）。
 * 单元格语义对齐作业登记工作簿：空白 / `—` 未交；`✓` 已交未计分；数字为分数。
 * 布局复用成绩表 `.grade-scroll` / `.grade-matrix`，冻结姓名列与表头，
 * 双轴滚动与切页边缘交接复用成绩表既有手势路径（`.grade-scroll`）。
 */

function assignmentKey(assignmentId, studentId) {
  return `${assignmentId}:${studentId}`;
}

/** 该生在指定作业下的单元格语义。 */
function resolveCell(submissionKeys, scoreMap, assignmentId, studentId) {
  const key = assignmentKey(assignmentId, studentId);
  if (!submissionKeys.has(key)) return { state: 'missing' };
  if (scoreMap.has(key)) return { state: 'score', value: scoreMap.get(key) };
  return { state: 'checked' };
}

/**
 * 按某作业分数排序；未交与已交未计分均无分数，沉底并保持名单顺序。
 * 与成绩表排序习惯一致：无值恒沉底，同值按名单序。
 */
function sortStudentsByAssignment(students, assignmentId, direction, submissionKeys, scoreMap) {
  if (assignmentId == null) return students;
  const ranked = students.map((student, index) => {
    const cell = resolveCell(submissionKeys, scoreMap, assignmentId, student.id);
    return {
      student,
      index,
      score: cell.state === 'score' ? cell.value : undefined
    };
  });
  ranked.sort((a, b) => {
    const aMissing = a.score === undefined;
    const bMissing = b.score === undefined;
    if (aMissing && bMissing) return a.index - b.index;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (a.score !== b.score) {
      return direction === 'asc' ? a.score - b.score : b.score - a.score;
    }
    return a.index - b.index;
  });
  return ranked.map(({ student }) => student);
}

function renderSummary({ students, assignments, submissions, scores }) {
  const submissionKeys = new Set(
    submissions.map((item) => assignmentKey(item.assignmentId, item.studentId))
  );
  const scoreMap = new Map(
    scores.map((item) => [assignmentKey(item.assignmentId, item.studentId), item.value])
  );
  const sort = state.summarySort
    && assignments.some((assignment) => assignment.id === state.summarySort.assignmentId)
    ? state.summarySort
    : null;
  const orderedStudents = sort
    ? sortStudentsByAssignment(
      students,
      sort.assignmentId,
      sort.direction,
      submissionKeys,
      scoreMap
    )
    : students;

  const scroller = document.createElement('div');
  scroller.className = 'grade-scroll';

  const table = document.createElement('div');
  table.className = 'grade-matrix summary-matrix';
  table.style.setProperty('--grade-cols', String(assignments.length));

  const head = document.createElement('div');
  head.className = 'grade-head';
  head.setAttribute('role', 'row');
  const nameHead = document.createElement('span');
  nameHead.className = 'grade-name-head';
  nameHead.setAttribute('role', 'columnheader');
  nameHead.textContent = '姓名';
  head.append(nameHead);
  for (const assignment of assignments) {
    const col = document.createElement('button');
    col.type = 'button';
    col.className = 'grade-subject-head';
    col.dataset.assignmentId = String(assignment.id);
    col.setAttribute('role', 'columnheader');
    col.textContent = assignment.name;
    if (sort?.assignmentId === assignment.id) {
      col.dataset.sort = sort.direction;
      const directionLabel = sort.direction === 'desc' ? '降序' : '升序';
      col.setAttribute('aria-label', `作业 ${assignment.name}，当前${directionLabel}，轻点切换排序`);
    } else {
      col.setAttribute('aria-label', `作业 ${assignment.name}，轻点排序`);
    }
    head.append(col);
  }
  table.append(head);

  for (const student of orderedStudents) {
    const row = document.createElement('div');
    row.className = 'grade-row';
    row.setAttribute('role', 'row');
    const nameCell = document.createElement('span');
    nameCell.className = 'grade-name';
    nameCell.setAttribute('role', 'cell');
    nameCell.textContent = student.name;
    row.append(nameCell);
    for (const assignment of assignments) {
      const cell = document.createElement('span');
      cell.className = 'grade-score-cell summary-cell';
      cell.setAttribute('role', 'cell');
      const resolved = resolveCell(submissionKeys, scoreMap, assignment.id, student.id);
      if (resolved.state === 'score') {
        cell.classList.add('is-filled');
        cell.textContent = String(resolved.value);
        cell.setAttribute('aria-label', `${student.name}，作业 ${assignment.name}，${resolved.value} 分`);
      } else if (resolved.state === 'checked') {
        cell.classList.add('is-checked');
        cell.textContent = '✓';
        cell.setAttribute('aria-label', `${student.name}，作业 ${assignment.name}，已交未计分`);
      } else {
        cell.textContent = '—';
        cell.setAttribute('aria-label', `${student.name}，作业 ${assignment.name}，未交`);
      }
      row.append(cell);
    }
    table.append(row);
  }

  scroller.append(table);
  elements.assignmentSummary.replaceChildren(scroller);
  return bindGradeScrollChrome(scroller);
}

/** 列头轻点循环排序：降序 → 升序 → 名单序（null）。 */
function nextSummarySort(assignmentId) {
  const current = state.summarySort;
  if (!current || current.assignmentId !== assignmentId) {
    return { assignmentId, direction: 'desc' };
  }
  if (current.direction === 'desc') {
    return { assignmentId, direction: 'asc' };
  }
  return null;
}

export function initSummaryRenderer(store) {
  let releaseScrollChrome = () => {};

  function render(snapshot = store.getSnapshot()) {
    releaseScrollChrome();
    releaseScrollChrome = renderSummary(snapshot);
  }

  elements.assignmentSummary.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const head = target.closest('.grade-subject-head');
    if (!head || !elements.assignmentSummary.contains(head)) return;
    const assignmentId = Number(head.dataset.assignmentId);
    if (!Number.isSafeInteger(assignmentId) || assignmentId <= 0) return;
    setSummarySort(nextSummarySort(assignmentId));
    render();
  });

  return { render };
}
