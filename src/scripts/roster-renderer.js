import { elements } from './dom.js';
import { state as uiState } from './state.js';
import { SEAT_COLUMNS, SEAT_COUNT } from './roster-model.js';
import {
  getSeatViewGeometry,
  SEAT_CARD_HEIGHT,
  SEAT_CARD_WIDTH,
  SEAT_CELL_HEIGHT,
  SEAT_CELL_WIDTH,
  SEAT_GRID_HEIGHT,
  SEAT_LANDSCAPE_CARD_HEIGHT,
  SEAT_LANDSCAPE_CARD_WIDTH,
  SEAT_STAGE_HEIGHT,
  SEAT_STAGE_WIDTH,
  SEAT_VIEW_CARD_HEIGHT,
  SEAT_VIEW_CARD_WIDTH
} from './seat-geometry.js';

function describeStudent(student, completed, score) {
  const status = score === undefined ? (completed ? '已完成' : '未记录') : `已完成，${score} 分`;
  const action = uiState.quickScoreMode
    ? '轻点打分，长按切换完成状态。'
    : '轻点切换完成状态。';
  return `${student.name}，${status}。${action}`;
}

function describeSeatStudent(student, completed, score, seatIndex) {
  const row = Math.floor(seatIndex / SEAT_COLUMNS) + 1;
  const column = seatIndex % SEAT_COLUMNS + 1;
  const status = score === undefined ? (completed ? '已完成' : '未记录') : `已完成，${score} 分`;
  const action = uiState.seatEditing
    ? '编辑模式。拖动调整座位；键盘可用方向键选择目标，回车确认。'
    : uiState.quickScoreMode
      ? '轻点打分，长按登记。'
      : '轻点登记，长按打分。';
  return `${student.name}，第 ${row} 排第 ${column} 列，${status}。${action}`;
}

function updateSeatCardName(card, name) {
  let label = card.querySelector('.seat-name');
  if (!label) {
    label = document.createElement('span');
    label.className = 'seat-name';
    label.setAttribute('aria-hidden', 'true');
    card.replaceChildren(label);
  }
  if (label.dataset.name === name) return;
  label.dataset.name = name;
  label.replaceChildren(...Array.from(name, (character) => {
    const line = document.createElement('span');
    line.textContent = character;
    return line;
  }));
}

export function initRosterRenderer(store) {
  const geometry = {
    '--seat-columns': SEAT_COLUMNS,
    '--seat-rows': SEAT_COUNT / SEAT_COLUMNS,
    '--seat-cell-width': `${SEAT_CELL_WIDTH}px`,
    '--seat-cell-height': `${SEAT_CELL_HEIGHT}px`,
    '--seat-card-width': `${SEAT_CARD_WIDTH}px`,
    '--seat-card-height': `${SEAT_CARD_HEIGHT}px`,
    '--seat-view-card-width': `${SEAT_VIEW_CARD_WIDTH}px`,
    '--seat-view-card-height': `${SEAT_VIEW_CARD_HEIGHT}px`,
    '--seat-landscape-card-width': `${SEAT_LANDSCAPE_CARD_WIDTH}px`,
    '--seat-landscape-card-height': `${SEAT_LANDSCAPE_CARD_HEIGHT}px`,
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
    // 名单网格行数随人数自适应（竖屏 5 列 / 横屏 10 列），避免超过 50 人时卡片进入隐式轨道被裁剪
    elements.studentGrid.style.setProperty('--student-grid-rows', String(Math.max(1, Math.ceil(state.students.length / 5))));
    elements.studentGrid.style.setProperty('--student-grid-rows-wide', String(Math.max(1, Math.ceil(state.students.length / 10))));
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
    const viewGeometry = getSeatViewGeometry(state.seats);
    const landscapeGeometry = getSeatViewGeometry(state.seats, { landscape: true });
    elements.seatStage.style.setProperty('--seat-view-stage-width', `${viewGeometry.width}px`);
    elements.seatStage.style.setProperty('--seat-view-grid-height', `${viewGeometry.gridHeight}px`);
    elements.seatStage.style.setProperty('--seat-view-stage-height', `${viewGeometry.height}px`);
    elements.seatStage.style.setProperty('--seat-landscape-stage-width', `${landscapeGeometry.width}px`);
    elements.seatStage.style.setProperty('--seat-landscape-grid-height', `${landscapeGeometry.gridHeight}px`);
    elements.seatStage.style.setProperty('--seat-landscape-stage-height', `${landscapeGeometry.height}px`);
    elements.seatGrid.style.setProperty('--view-seat-columns', viewGeometry.columns.map((value) => `${value}px`).join(' '));
    elements.seatGrid.style.setProperty('--view-seat-rows', viewGeometry.rows.map((value) => `${value}px`).join(' '));
    elements.seatGrid.style.setProperty('--landscape-seat-columns', landscapeGeometry.columns.map((value) => `${value}px`).join(' '));
    elements.seatGrid.style.setProperty('--landscape-seat-rows', landscapeGeometry.rows.map((value) => `${value}px`).join(' '));
    seatCells.forEach((cell, seatIndex) => {
      const row = Math.floor(seatIndex / SEAT_COLUMNS);
      cell.style.setProperty('--seat-landscape-row-offset', `${landscapeGeometry.rowOffsets[row]}px`);
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
      card.setAttribute('aria-label', describeSeatStudent(student, completed, score, seatIndex));
      card.classList.toggle('is-completed', completed);
      if (score === undefined) delete card.dataset.score;
      else card.dataset.score = String(score);
      updateSeatCardName(card, student.name);
    });
  }

  render();
  return { render, unsubscribe: store.subscribe(render) };
}
