import { elements } from './dom.js';
import { SCHEDULE_DAY_LABELS, formatPeriodColumnLabel } from './roster-model.js';
import { state } from './state.js';

function slotMap(scheduleSlots) {
  const map = new Map();
  for (const slot of scheduleSlots) {
    map.set(`${slot.day}:${slot.periodId}`, slot.subject);
  }
  return map;
}

function gradeMap(courseGrades, examId) {
  const map = new Map();
  for (const grade of courseGrades) {
    if (grade.examId !== examId) continue;
    map.set(`${grade.subjectId}:${grade.studentId}`, grade.value);
  }
  return map;
}

function periodBand(index) {
  if (index === 0) return 'dawn';
  if (index > 0 && index < 5) return 'am';
  if (index === 5) return 'noon';
  if (index > 5 && index < 9) return 'pm';
  if (index === 9) return 'dusk';
  return 'lesson';
}

function todayDayIndex() {
  const weekday = new Date().getDay();
  return weekday >= 1 && weekday <= 5 ? weekday - 1 : -1;
}

export function resolveGradeExamId(snapshot, preferredId = state.gradeExamId) {
  const exams = snapshot?.exams;
  if (!Array.isArray(exams) || !exams.length) return null;
  if (preferredId != null && exams.some((exam) => exam.id === preferredId)) return preferredId;
  return exams[0].id;
}

function sortStudents(students, grades, sort) {
  if (!sort) return students;
  const { subjectId, direction } = sort;
  const ranked = students.map((student, index) => ({
    student,
    index,
    value: grades.get(`${subjectId}:${student.id}`)
  }));
  ranked.sort((a, b) => {
    const aMissing = a.value === undefined;
    const bMissing = b.value === undefined;
    if (aMissing && bMissing) return a.index - b.index;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (a.value !== b.value) {
      return direction === 'asc' ? a.value - b.value : b.value - a.value;
    }
    return a.index - b.index;
  });
  return ranked.map(({ student }) => student);
}

function renderWeekStrip({ periods, scheduleSlots }, matchesHighlight) {
  const slots = slotMap(scheduleSlots);
  const today = todayDayIndex();
  const root = document.createElement('div');
  root.className = 'week-matrix';
  if (today >= 0) root.dataset.today = String(today);

  const head = document.createElement('div');
  head.className = 'week-matrix-head';
  head.setAttribute('aria-hidden', 'true');
  const corner = document.createElement('span');
  corner.className = 'week-matrix-corner';
  corner.setAttribute('aria-hidden', 'true');
  head.append(corner);
  for (let day = 0; day < SCHEDULE_DAY_LABELS.length; day += 1) {
    const dayEl = document.createElement('span');
    dayEl.className = 'week-matrix-day';
    if (day === today) dayEl.classList.add('is-today');
    dayEl.textContent = SCHEDULE_DAY_LABELS[day];
    head.append(dayEl);
  }
  root.append(head);

  const body = document.createElement('div');
  body.className = 'week-matrix-body';
  body.setAttribute('role', 'grid');
  body.setAttribute('aria-label', '本周课表');

  periods.forEach((period, index) => {
    // Soft band breaks before 午测 / 课后服务 — keeps am·noon·pm rhythm readable.
    if (index === 5 || index === 9) {
      const gap = document.createElement('div');
      gap.className = 'week-matrix-band-gap';
      gap.setAttribute('aria-hidden', 'true');
      body.append(gap);
    }

    const band = periodBand(index);
    const row = document.createElement('div');
    row.className = `week-matrix-row is-${band}`;
    row.dataset.band = band;
    row.setAttribute('role', 'row');

    const periodBtn = document.createElement('button');
    periodBtn.type = 'button';
    periodBtn.className = 'week-period-label';
    periodBtn.dataset.periodId = String(period.id);
    periodBtn.dataset.band = band;
    periodBtn.textContent = formatPeriodColumnLabel(period.title);
    periodBtn.setAttribute('aria-label', `节次 ${period.title}，长按可改名`);
    row.append(periodBtn);

    for (let day = 0; day < SCHEDULE_DAY_LABELS.length; day += 1) {
      const subject = slots.get(`${day}:${period.id}`);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'week-slot-cell';
      if (day === today) cell.classList.add('is-today-col');
      cell.dataset.day = String(day);
      cell.dataset.periodId = String(period.id);
      cell.setAttribute('role', 'gridcell');
      const dayLabel = SCHEDULE_DAY_LABELS[day];
      if (subject) {
        cell.classList.add('is-filled');
        if (matchesHighlight?.(subject)) cell.classList.add('is-highlight');
        cell.textContent = subject;
        cell.setAttribute('aria-label', `周${dayLabel} ${period.title}，${subject}`);
      } else {
        cell.textContent = '';
        cell.setAttribute('aria-label', `周${dayLabel} ${period.title}，未安排`);
      }
      row.append(cell);
    }
    body.append(row);
  });

  root.append(body);
  elements.weekStrip.replaceChildren(root);
}

function renderGradeTable({ students, subjects, courseGrades }, examId) {
  const grades = gradeMap(courseGrades, examId);
  const sort = state.gradeSort
    && subjects.some((subject) => subject.id === state.gradeSort.subjectId)
    ? state.gradeSort
    : null;
  const orderedStudents = sortStudents(students, grades, sort);

  const scroller = document.createElement('div');
  scroller.className = 'grade-scroll';

  const table = document.createElement('div');
  table.className = 'grade-matrix';
  table.style.setProperty('--grade-cols', String(subjects.length));

  const head = document.createElement('div');
  head.className = 'grade-head';
  head.setAttribute('role', 'row');
  const nameHead = document.createElement('span');
  nameHead.className = 'grade-name-head';
  nameHead.setAttribute('role', 'columnheader');
  nameHead.textContent = '姓名';
  head.append(nameHead);
  for (const subject of subjects) {
    const col = document.createElement('button');
    col.type = 'button';
    col.className = 'grade-subject-head';
    col.dataset.subjectId = String(subject.id);
    col.setAttribute('role', 'columnheader');
    col.textContent = subject.title;
    if (sort?.subjectId === subject.id) {
      col.dataset.sort = sort.direction;
      const directionLabel = sort.direction === 'desc' ? '降序' : '升序';
      col.setAttribute('aria-label', `科目 ${subject.title}，当前${directionLabel}，轻点切换排序，长按可编辑`);
    } else {
      col.setAttribute('aria-label', `科目 ${subject.title}，轻点排序，长按可编辑`);
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
    for (const subject of subjects) {
      const value = grades.get(`${subject.id}:${student.id}`);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'grade-score-cell';
      cell.dataset.studentId = String(student.id);
      cell.dataset.subjectId = String(subject.id);
      cell.setAttribute('role', 'cell');
      if (value !== undefined) {
        cell.classList.add('is-filled');
        cell.textContent = String(value);
        cell.setAttribute('aria-label', `${student.name}，${subject.title}，${value} 分`);
      } else {
        cell.textContent = '—';
        cell.setAttribute('aria-label', `${student.name}，${subject.title}，未录入`);
      }
      row.append(cell);
    }
    table.append(row);
  }

  scroller.append(table);
  elements.gradeTable.replaceChildren(scroller);
}

export function initCoursesRenderer(store, highlightSubjects) {
  function render(snapshot = store.getSnapshot()) {
    renderWeekStrip(snapshot, (subject) => highlightSubjects?.matches?.(subject));
    const examId = resolveGradeExamId(snapshot);
    if (examId != null) renderGradeTable(snapshot, examId);
    else elements.gradeTable.replaceChildren();
  }

  store.subscribe(render);
  highlightSubjects?.subscribe?.(render);
  render();
  return { render };
}
