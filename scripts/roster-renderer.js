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
  }

  render();
  return { render, unsubscribe: store.subscribe(render) };
}
