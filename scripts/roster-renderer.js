import { elements } from './dom.js';
import { SEAT_COLUMNS, SEAT_COUNT } from './roster-model.js';
import {
  SEAT_CELL_HEIGHT,
  SEAT_CELL_WIDTH,
  SEAT_EMPTY_COLUMN_WIDTH,
  SEAT_GRID_HEIGHT,
  SEAT_STAGE_HEIGHT,
  SEAT_STAGE_WIDTH,
  SEAT_VIEW_GRID_HEIGHT,
  SEAT_VIEW_ROW_HEIGHT
} from './seat-geometry.js';

function describeStudent(student, completed, score) {
  const status = score === undefined ? (completed ? '已完成' : '未记录') : `已完成，${score} 分`;
  return `${student.name}，${status}。轻点切换完成状态。`;
}

export function initRosterRenderer(store) {
  const geometry = {
    '--seat-columns': SEAT_COLUMNS,
    '--seat-rows': SEAT_COUNT / SEAT_COLUMNS,
    '--seat-cell-width': `${SEAT_CELL_WIDTH}px`,
    '--seat-cell-height': `${SEAT_CELL_HEIGHT}px`,
    '--seat-view-row-height': `${SEAT_VIEW_ROW_HEIGHT}px`,
    '--seat-view-grid-height': `${SEAT_VIEW_GRID_HEIGHT}px`,
    '--seat-grid-height': `${SEAT_GRID_HEIGHT}px`,
    '--seat-stage-width': `${SEAT_STAGE_WIDTH}px`,
    '--seat-stage-height': `${SEAT_STAGE_HEIGHT}px`
  };
  for (const [property, value] of Object.entries(geometry)) {
    elements.seatStage.style.setProperty(property, String(value));
  }
  const seatCells = Array.from({ length: SEAT_COUNT }, (_, seatIndex) => {
    const cell = document.createElement('div');
    cell.className = 'seat-cell';
    cell.dataset.seatIndex = String(seatIndex);
    cell.classList.toggle('is-first-column', seatIndex % SEAT_COLUMNS === 0);
    cell.classList.toggle('is-first-row', seatIndex < SEAT_COLUMNS);
    cell.setAttribute('role', 'listitem');
    return cell;
  });
  elements.seatGrid.replaceChildren(...seatCells);
  const studentCardsById = new Map();

  function updateStudentCard(card, student, completed, score) {
    card.dataset.studentId = String(student.id);
    card.setAttribute('aria-pressed', String(completed));
    card.setAttribute('aria-label', describeStudent(student, completed, score));
    card.classList.toggle('is-completed', completed);
    if (score === undefined) delete card.dataset.score;
    else card.dataset.score = String(score);
    if (card.textContent !== student.name) card.textContent = student.name;
  }

  function render(state = store.getSnapshot()) {
    const completedStudentIds = store.getCompletedStudentIds();
    const nextStudentIds = new Set(state.students.map((student) => student.id));
    for (const studentId of studentCardsById.keys()) {
      if (!nextStudentIds.has(studentId)) studentCardsById.delete(studentId);
    }
    const cards = state.students.map((student) => {
      const completed = completedStudentIds.has(student.id);
      const score = store.getScore(student.id);
      let card = studentCardsById.get(student.id);
      if (!card) {
        card = document.createElement('button');
        card.type = 'button';
        card.className = 'student-card';
        card.setAttribute('role', 'listitem');
        studentCardsById.set(student.id, card);
      }
      updateStudentCard(card, student, completed, score);
      return card;
    });
    const currentCards = elements.studentGrid.children;
    const sameChildren = currentCards.length === cards.length
      && cards.every((card, index) => currentCards[index] === card);
    if (!sameChildren) elements.studentGrid.replaceChildren(...cards);
    const studentById = new Map(state.students.map((student) => [student.id, student]));
    const seatByIndex = new Map(state.seats.map((seat) => [seat.seatIndex, seat]));
    const occupiedColumns = new Set(state.seats.map(({ seatIndex }) => seatIndex % SEAT_COLUMNS));
    elements.seatGrid.style.setProperty(
      '--view-seat-columns',
      Array.from({ length: SEAT_COLUMNS }, (_, column) => (
        `${occupiedColumns.has(column) ? SEAT_CELL_WIDTH : SEAT_EMPTY_COLUMN_WIDTH}px`
      )).join(' ')
    );
    seatCells.forEach((cell, seatIndex) => {
      const seat = seatByIndex.get(seatIndex);
      const student = seat ? studentById.get(seat.studentId) : undefined;
      if (!student) {
        cell.replaceChildren();
        return;
      }
      const completed = completedStudentIds.has(student.id);
      const score = store.getScore(student.id);
      let card = cell.querySelector('.seat-card');
      if (!card) {
        card = document.createElement('button');
        card.type = 'button';
        card.className = 'seat-card';
        cell.replaceChildren(card);
      }
      card.dataset.studentId = String(student.id);
      card.dataset.seatIndex = String(seatIndex);
      card.setAttribute('aria-pressed', String(completed));
      card.setAttribute('aria-label', `${describeStudent(student, completed, score)}座位表中。`);
      card.classList.toggle('is-completed', completed);
      if (score === undefined) delete card.dataset.score;
      else card.dataset.score = String(score);
      if (card.textContent !== student.name) card.textContent = student.name;
    });
  }

  render();
  return { render, unsubscribe: store.subscribe(render) };
}
