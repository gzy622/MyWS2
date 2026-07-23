import { elements } from './dom.js';

function describeStudent(student, completed) {
  return `${student.name}，${completed ? '已完成' : '未记录'}。轻点切换完成状态。`;
}

export function initRosterRenderer(store) {
  function render(state = store.getSnapshot()) {
    const completedStudentIds = store.getCompletedStudentIds();
    const cards = state.students.map((student) => {
      const completed = completedStudentIds.has(student.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'student-card';
      card.dataset.studentId = String(student.id);
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-pressed', String(completed));
      card.setAttribute('aria-label', describeStudent(student, completed));
      card.classList.toggle('is-completed', completed);
      card.textContent = student.name;
      return card;
    });
    elements.studentGrid.replaceChildren(...cards);
    const studentById = new Map(state.students.map((student) => [student.id, student]));
    [...document.querySelectorAll('.seat-card')].forEach((card, index) => {
      const student = studentById.get(state.seats[index]?.studentId);
      if (!student) return;
      const completed = completedStudentIds.has(student.id);
      const score = store.getScore(student.id);
      card.dataset.studentId = String(student.id);
      card.dataset.seatIndex = String(state.seats[index].seatIndex);
      card.setAttribute('aria-pressed', String(completed));
      card.setAttribute('aria-label', `${describeStudent(student, completed)}座位表中。`);
      card.classList.toggle('is-completed', completed);
      if (score === undefined) delete card.dataset.score;
      else card.dataset.score = String(score);
      card.textContent = student.name;
    });
  }

  render();
  return { render, unsubscribe: store.subscribe(render) };
}
