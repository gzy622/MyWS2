import { elements } from './dom.js';

function namesByIds(students, studentIds) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) return [];
  const byId = new Map(students.map((student) => [student.id, student.name]));
  return studentIds.map((id) => byId.get(id)).filter(Boolean);
}

function createRoleRow(role, names) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'row people-row';
  row.setAttribute('role', 'listitem');
  row.dataset.peopleKind = 'role';
  row.dataset.peopleId = String(role.id);
  const assigned = names.length > 0;
  const namesText = names.join('、');
  row.setAttribute(
    'aria-label',
    assigned ? `${role.title}，${namesText}` : `${role.title}，未指定`
  );
  row.innerHTML = [
    '<div class="grow">',
    '<div class="item-title"></div>',
    assigned ? '<div class="item-assignees"></div>' : '',
    '</div>',
    assigned ? '' : '<span class="item-status">未指定</span>'
  ].join('');
  row.querySelector('.item-title').textContent = role.title;
  if (assigned) row.querySelector('.item-assignees').textContent = namesText;
  return row;
}

function createDutyRow(duty, names) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'row people-row';
  row.setAttribute('role', 'listitem');
  row.dataset.peopleKind = 'duty';
  row.dataset.peopleId = String(duty.id);
  const note = duty.note || '';
  const assigned = names.length > 0;
  const namesText = names.join('、');
  row.setAttribute(
    'aria-label',
    assigned
      ? `${duty.title}，${namesText}${note ? `，${note}` : ''}`
      : `${duty.title}，未排${note ? `，${note}` : ''}`
  );
  row.innerHTML = [
    '<div class="grow">',
    '<div class="item-title"></div>',
    note ? '<div class="item-note"></div>' : '',
    assigned ? '<div class="item-assignees"></div>' : '',
    '</div>',
    assigned ? '' : '<span class="item-status">未排</span>'
  ].join('');
  row.querySelector('.item-title').textContent = duty.title;
  if (note) row.querySelector('.item-note').textContent = note;
  if (assigned) row.querySelector('.item-assignees').textContent = namesText;
  return row;
}

export function initPeopleRenderer(store) {
  function render(snapshot = store.getSnapshot()) {
    const { students, roles, duties } = snapshot;
    elements.roleList.replaceChildren(
      ...roles.map((role) => createRoleRow(role, namesByIds(students, role.studentIds)))
    );
    elements.dutyList.replaceChildren(
      ...duties.map((duty) => createDutyRow(duty, namesByIds(students, duty.studentIds)))
    );
  }

  store.subscribe(render);
  render();
  return { render };
}
