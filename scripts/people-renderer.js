import { elements } from './dom.js';

function studentNameById(students, studentId) {
  if (studentId == null) return null;
  return students.find((student) => student.id === studentId)?.name ?? null;
}

function createRoleRow(role, name) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'row people-row';
  row.setAttribute('role', 'listitem');
  row.dataset.peopleKind = 'role';
  row.dataset.peopleId = String(role.id);
  row.setAttribute('aria-label', name ? `${role.title}，${name}` : `${role.title}，未指定`);
  row.innerHTML = `<div class="grow"><div class="item-title"></div></div><span class="item-status"></span>`;
  row.querySelector('.item-title').textContent = role.title;
  const status = row.querySelector('.item-status');
  status.textContent = name || '未指定';
  status.classList.toggle('is-assigned', Boolean(name));
  return row;
}

function createDutyRow(duty, name) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'row people-row';
  row.setAttribute('role', 'listitem');
  row.dataset.peopleKind = 'duty';
  row.dataset.peopleId = String(duty.id);
  const note = duty.note || '';
  row.setAttribute(
    'aria-label',
    name
      ? `${duty.title}，${name}${note ? `，${note}` : ''}`
      : `${duty.title}，未排${note ? `，${note}` : ''}`
  );
  row.innerHTML = `<div class="grow"><div class="item-title"></div><div class="item-note"></div></div><span class="item-status"></span>`;
  row.querySelector('.item-title').textContent = duty.title;
  const noteEl = row.querySelector('.item-note');
  if (note) {
    noteEl.textContent = note;
  } else {
    noteEl.remove();
  }
  const status = row.querySelector('.item-status');
  status.textContent = name || '未排';
  status.classList.toggle('is-assigned', Boolean(name));
  return row;
}

export function initPeopleRenderer(store) {
  function render(snapshot = store.getSnapshot()) {
    const { students, roles, duties } = snapshot;
    elements.roleList.replaceChildren(
      ...roles.map((role) => createRoleRow(role, studentNameById(students, role.studentId)))
    );
    elements.dutyList.replaceChildren(
      ...duties.map((duty) => createDutyRow(duty, studentNameById(students, duty.studentId)))
    );
  }

  store.subscribe(render);
  render();
  return { render };
}
