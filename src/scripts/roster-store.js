import {
  cloneRosterState,
  COURSE_TEXT_MAX_LENGTH,
  createDefaultRosterState,
  isValidRosterState,
  parseScore,
  PEOPLE_TEXT_MAX_LENGTH,
  SCHEDULE_DAY_COUNT,
  SEAT_COUNT
} from './roster-model.js';

function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name || null;
}

function cleanPeopleTitle(value) {
  if (typeof value !== 'string') return null;
  const title = value.trim();
  if (!title || title.length > PEOPLE_TEXT_MAX_LENGTH) return null;
  return title;
}

function cleanNote(value) {
  if (typeof value !== 'string') return null;
  const note = value.trim();
  if (note.length > PEOPLE_TEXT_MAX_LENGTH) return null;
  return note;
}

function cleanCourseSubject(value) {
  if (typeof value !== 'string') return null;
  const subject = value.trim();
  if (!subject || subject.length > COURSE_TEXT_MAX_LENGTH) return null;
  return subject;
}

function recordKey(assignmentId, studentId) {
  return `${assignmentId}:${studentId}`;
}

export class RosterStore {
  #state;
  #listeners = new Set();
  #persist;

  constructor(initialState = createDefaultRosterState(), persist) {
    this.#state = isValidRosterState(initialState)
      ? cloneRosterState(initialState)
      : createDefaultRosterState();
    this.#persist = typeof persist === 'function' ? persist : null;
  }

  getSnapshot() {
    return cloneRosterState(this.#state);
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Roster listener must be a function');
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getCurrentAssignment() {
    const assignment = this.#state.assignments.find(({ id }) => id === this.#state.activeAssignmentId);
    return { ...assignment };
  }

  getCompletedStudentIds(assignmentId = this.#state.activeAssignmentId) {
    if (!this.#hasAssignment(assignmentId)) return new Set();
    return new Set(
      this.#state.submissions
        .filter((submission) => submission.assignmentId === assignmentId)
        .map((submission) => submission.studentId)
    );
  }

  getScore(studentId, assignmentId = this.#state.activeAssignmentId) {
    if (!this.#hasStudent(studentId) || !this.#hasAssignment(assignmentId)) return undefined;
    return this.#state.scores.find((score) => (
      score.assignmentId === assignmentId && score.studentId === studentId
    ))?.value;
  }

  getCompletedCount(assignmentId = this.#state.activeAssignmentId) {
    return this.getCompletedStudentIds(assignmentId).size;
  }

  getMissingStudents(assignmentId = this.#state.activeAssignmentId) {
    const completed = this.getCompletedStudentIds(assignmentId);
    return this.#state.students
      .filter((student) => !completed.has(student.id))
      .map((student) => ({ ...student }));
  }

  toggleCompletion(studentId) {
    if (!this.#hasStudent(studentId)) return false;
    const assignmentId = this.#state.activeAssignmentId;
    const index = this.#state.submissions.findIndex((submission) => (
      submission.assignmentId === assignmentId && submission.studentId === studentId
    ));
    if (index >= 0) {
      this.#state.submissions.splice(index, 1);
      this.#removeScore(studentId, assignmentId);
    } else {
      this.#state.submissions.push({ assignmentId, studentId });
    }
    this.#notify();
    return true;
  }

  markStudentCompleted(studentId) {
    if (!this.#hasStudent(studentId)) return false;
    const assignmentId = this.#state.activeAssignmentId;
    const completed = this.getCompletedStudentIds().has(studentId);
    const hadScore = this.getScore(studentId) !== undefined;
    if (!completed) this.#state.submissions.push({ assignmentId, studentId });
    this.#removeScore(studentId, assignmentId);
    if (!completed || hadScore) this.#notify();
    return !completed || hadScore;
  }

  setScore(studentId, value) {
    if (!this.#hasStudent(studentId)) return 'invalid';
    const scoreValue = parseScore(value);
    if (scoreValue === null) return 'invalid';

    const assignmentId = this.#state.activeAssignmentId;
    const score = this.#state.scores.find((item) => (
      item.assignmentId === assignmentId && item.studentId === studentId
    ));
    if (score) score.value = scoreValue;
    else this.#state.scores.push({ assignmentId, studentId, value: scoreValue });
    if (!this.getCompletedStudentIds().has(studentId)) {
      this.#state.submissions.push({ assignmentId, studentId });
    }
    this.#notify();
    return 'saved';
  }

  clearStudentRecord(studentId) {
    if (!this.#hasStudent(studentId)) return false;
    const assignmentId = this.#state.activeAssignmentId;
    const originalLength = this.#state.submissions.length;
    this.#state.submissions = this.#state.submissions.filter((submission) => (
      submission.assignmentId !== assignmentId || submission.studentId !== studentId
    ));
    const scoreRemoved = this.#removeScore(studentId, assignmentId);
    const changed = originalLength !== this.#state.submissions.length || scoreRemoved;
    if (changed) this.#notify();
    return changed;
  }

  markAllCompleted() {
    const assignmentId = this.#state.activeAssignmentId;
    const completed = this.getCompletedStudentIds();
    const missingStudentIds = this.#state.students
      .map(({ id }) => id)
      .filter((studentId) => !completed.has(studentId));
    if (!missingStudentIds.length) return false;
    this.#state.submissions.push(...missingStudentIds.map((studentId) => ({ assignmentId, studentId })));
    this.#notify();
    return true;
  }

  clearCurrentAssignment() {
    const assignmentId = this.#state.activeAssignmentId;
    const hadRecords = this.#state.submissions.some((item) => item.assignmentId === assignmentId)
      || this.#state.scores.some((item) => item.assignmentId === assignmentId);
    if (!hadRecords) return false;
    this.#state.submissions = this.#state.submissions.filter((item) => item.assignmentId !== assignmentId);
    this.#state.scores = this.#state.scores.filter((item) => item.assignmentId !== assignmentId);
    this.#notify();
    return true;
  }

  selectAssignment(id) {
    if (!this.#hasAssignment(id) || id === this.#state.activeAssignmentId) return false;
    this.#state.activeAssignmentId = id;
    this.#notify();
    return true;
  }

  addAssignment(value) {
    const name = cleanName(value);
    if (!name || this.#state.nextAssignmentId >= Number.MAX_SAFE_INTEGER) return null;
    const id = this.#state.nextAssignmentId + 1;
    const assignment = { id, name };
    this.#state.assignments.push(assignment);
    this.#state.nextAssignmentId = id;
    this.#state.activeAssignmentId = id;
    this.#notify();
    return { ...assignment };
  }

  renameAssignment(id, value) {
    const name = cleanName(value);
    const assignment = this.#state.assignments.find((item) => item.id === id);
    if (!assignment || !name || assignment.name === name) return false;
    assignment.name = name;
    this.#notify();
    return true;
  }

  deleteAssignment(id) {
    if (this.#state.assignments.length <= 1) return false;
    const index = this.#state.assignments.findIndex((assignment) => assignment.id === id);
    if (index < 0) return false;
    this.#state.assignments.splice(index, 1);
    this.#state.submissions = this.#state.submissions.filter((item) => item.assignmentId !== id);
    this.#state.scores = this.#state.scores.filter((item) => item.assignmentId !== id);
    if (this.#state.activeAssignmentId === id) {
      this.#state.activeAssignmentId = this.#state.assignments[index]?.id ?? this.#state.assignments[index - 1].id;
    }
    this.#notify();
    return true;
  }

  moveStudentSeat(studentId, targetSeatIndex) {
    if (!this.#hasStudent(studentId) || !Number.isInteger(targetSeatIndex)) return false;
    const movingSeat = this.#state.seats.find((seat) => seat.studentId === studentId);
    if (targetSeatIndex < 0 || targetSeatIndex >= SEAT_COUNT || !movingSeat) return false;
    if (movingSeat.seatIndex === targetSeatIndex) return true;
    const occupant = this.#state.seats.find((seat) => seat.seatIndex === targetSeatIndex);
    if (occupant) occupant.seatIndex = movingSeat.seatIndex;
    movingSeat.seatIndex = targetSeatIndex;
    this.#notify();
    return true;
  }

  /**
   * Atomically replace the entire business state.
   *
   * 1. Validates the snapshot as current schema.
   * 2. Deep-clones it so the caller cannot mutate the store later.
   * 3. Persists the cloned state **before** swapping the in-memory state
   *    (so a storage failure does not leave a half-replaced session).
   * 4. On success, replaces #state and notifies subscribers exactly once.
   *
   * @returns {'replaced' | 'invalid' | 'persist-failed'}
   */
  replaceSnapshot(snapshot) {
    if (!isValidRosterState(snapshot)) return 'invalid';

    const cloned = cloneRosterState(snapshot);

    if (this.#persist) {
      try {
        this.#persist(cloned);
      } catch {
        return 'persist-failed';
      }
    }

    this.#state = cloned;
    this.#notify();
    return 'replaced';
  }

  resetRoster() {
    const defaults = createDefaultRosterState();
    this.#state.students = defaults.students;
    this.#state.seats = defaults.seats;
    this.#state.submissions = [];
    this.#state.scores = [];
    this.#state.roles = defaults.roles;
    this.#state.duties = defaults.duties;
    this.#state.nextRoleId = defaults.nextRoleId;
    this.#state.nextDutyId = defaults.nextDutyId;
    this.#state.periods = defaults.periods;
    this.#state.scheduleSlots = [];
    this.#state.subjects = defaults.subjects;
    this.#state.courseGrades = [];
    this.#state.nextPeriodId = defaults.nextPeriodId;
    this.#state.nextSubjectId = defaults.nextSubjectId;
    this.#notify();
  }

  renamePeriod(periodId, value) {
    const title = cleanPeopleTitle(value);
    const period = this.#findPeriod(periodId);
    if (!period || !title || period.title === title) return false;
    period.title = title;
    this.#notify();
    return true;
  }

  getScheduleSlot(day, periodId) {
    if (!this.#isValidScheduleCoord(day, periodId)) return undefined;
    return this.#state.scheduleSlots.find((slot) => slot.day === day && slot.periodId === periodId)?.subject;
  }

  setScheduleSlot(day, periodId, value) {
    if (!this.#isValidScheduleCoord(day, periodId)) return false;
    const subject = cleanCourseSubject(value);
    if (!subject) return false;
    const existing = this.#state.scheduleSlots.find((slot) => slot.day === day && slot.periodId === periodId);
    if (existing) {
      if (existing.subject === subject) return true;
      existing.subject = subject;
    } else {
      this.#state.scheduleSlots.push({ day, periodId, subject });
    }
    this.#notify();
    return true;
  }

  clearScheduleSlot(day, periodId) {
    if (!this.#isValidScheduleCoord(day, periodId)) return false;
    const originalLength = this.#state.scheduleSlots.length;
    this.#state.scheduleSlots = this.#state.scheduleSlots.filter((slot) => (
      slot.day !== day || slot.periodId !== periodId
    ));
    const changed = originalLength !== this.#state.scheduleSlots.length;
    if (changed) this.#notify();
    return changed;
  }

  clearAllScheduleSlots() {
    if (!this.#state.scheduleSlots.length) return false;
    this.#state.scheduleSlots = [];
    this.#notify();
    return true;
  }

  getCourseGrade(studentId, subjectId) {
    if (!this.#hasStudent(studentId) || !this.#findSubject(subjectId)) return undefined;
    return this.#state.courseGrades.find((grade) => (
      grade.subjectId === subjectId && grade.studentId === studentId
    ))?.value;
  }

  setCourseGrade(studentId, subjectId, value) {
    if (!this.#hasStudent(studentId) || !this.#findSubject(subjectId)) return 'invalid';
    const scoreValue = parseScore(value);
    if (scoreValue === null) return 'invalid';
    const existing = this.#state.courseGrades.find((grade) => (
      grade.subjectId === subjectId && grade.studentId === studentId
    ));
    if (existing) existing.value = scoreValue;
    else this.#state.courseGrades.push({ subjectId, studentId, value: scoreValue });
    this.#notify();
    return 'saved';
  }

  clearCourseGrade(studentId, subjectId) {
    if (!this.#hasStudent(studentId) || !this.#findSubject(subjectId)) return false;
    const originalLength = this.#state.courseGrades.length;
    this.#state.courseGrades = this.#state.courseGrades.filter((grade) => (
      grade.subjectId !== subjectId || grade.studentId !== studentId
    ));
    const changed = originalLength !== this.#state.courseGrades.length;
    if (changed) this.#notify();
    return changed;
  }

  clearAllCourseGrades() {
    if (!this.#state.courseGrades.length) return false;
    this.#state.courseGrades = [];
    this.#notify();
    return true;
  }

  addSubject(value = '新科目') {
    const title = cleanPeopleTitle(value);
    if (!title || this.#state.nextSubjectId >= Number.MAX_SAFE_INTEGER) return null;
    const id = this.#state.nextSubjectId + 1;
    const subject = { id, title };
    this.#state.subjects.push(subject);
    this.#state.nextSubjectId = id;
    this.#notify();
    return { ...subject };
  }

  renameSubject(subjectId, value) {
    const title = cleanPeopleTitle(value);
    const subject = this.#findSubject(subjectId);
    if (!subject || !title || subject.title === title) return false;
    subject.title = title;
    this.#notify();
    return true;
  }

  deleteSubject(subjectId) {
    if (this.#state.subjects.length <= 1) return false;
    const index = this.#state.subjects.findIndex((subject) => subject.id === subjectId);
    if (index < 0) return false;
    this.#state.subjects.splice(index, 1);
    this.#state.courseGrades = this.#state.courseGrades.filter((grade) => grade.subjectId !== subjectId);
    this.#notify();
    return true;
  }

  toggleRoleStudent(roleId, studentId) {
    const role = this.#findRole(roleId);
    if (!role || !this.#hasStudent(studentId)) return false;
    const index = role.studentIds.indexOf(studentId);
    if (index >= 0) role.studentIds.splice(index, 1);
    else role.studentIds.push(studentId);
    this.#notify();
    return true;
  }

  setRoleStudents(roleId, studentIds) {
    const role = this.#findRole(roleId);
    if (!role || !Array.isArray(studentIds)) return false;
    const next = [];
    const seen = new Set();
    for (const id of studentIds) {
      if (!this.#hasStudent(id) || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    if (next.length === role.studentIds.length
      && next.every((id, index) => id === role.studentIds[index])) {
      return true;
    }
    role.studentIds = next;
    this.#notify();
    return true;
  }

  /** Ensure student is assigned (add if absent). */
  assignRole(roleId, studentId) {
    const role = this.#findRole(roleId);
    if (!role || !this.#hasStudent(studentId)) return false;
    if (role.studentIds.includes(studentId)) return true;
    role.studentIds.push(studentId);
    this.#notify();
    return true;
  }

  clearRole(roleId) {
    const role = this.#findRole(roleId);
    if (!role || role.studentIds.length === 0) return false;
    role.studentIds = [];
    this.#notify();
    return true;
  }

  addRole(value = '新班干') {
    const title = cleanPeopleTitle(value);
    if (!title || this.#state.nextRoleId >= Number.MAX_SAFE_INTEGER) return null;
    const id = this.#state.nextRoleId + 1;
    const role = { id, title, studentIds: [] };
    this.#state.roles.push(role);
    this.#state.nextRoleId = id;
    this.#notify();
    return { id, title, studentIds: [] };
  }

  renameRole(roleId, value) {
    const title = cleanPeopleTitle(value);
    const role = this.#findRole(roleId);
    if (!role || !title || role.title === title) return false;
    role.title = title;
    this.#notify();
    return true;
  }

  deleteRole(roleId) {
    if (this.#state.roles.length <= 1) return false;
    const index = this.#state.roles.findIndex((role) => role.id === roleId);
    if (index < 0) return false;
    this.#state.roles.splice(index, 1);
    this.#notify();
    return true;
  }

  clearAllRoleAssignments() {
    let changed = false;
    for (const role of this.#state.roles) {
      if (role.studentIds.length > 0) {
        role.studentIds = [];
        changed = true;
      }
    }
    if (changed) this.#notify();
    return changed;
  }

  toggleDutyStudent(dutyId, studentId) {
    const duty = this.#findDuty(dutyId);
    if (!duty || !this.#hasStudent(studentId)) return false;
    const index = duty.studentIds.indexOf(studentId);
    if (index >= 0) duty.studentIds.splice(index, 1);
    else duty.studentIds.push(studentId);
    this.#notify();
    return true;
  }

  setDutyStudents(dutyId, studentIds) {
    const duty = this.#findDuty(dutyId);
    if (!duty || !Array.isArray(studentIds)) return false;
    const next = [];
    const seen = new Set();
    for (const id of studentIds) {
      if (!this.#hasStudent(id) || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    if (next.length === duty.studentIds.length
      && next.every((id, index) => id === duty.studentIds[index])) {
      return true;
    }
    duty.studentIds = next;
    this.#notify();
    return true;
  }

  /** Ensure student is assigned (add if absent). */
  assignDuty(dutyId, studentId) {
    const duty = this.#findDuty(dutyId);
    if (!duty || !this.#hasStudent(studentId)) return false;
    if (duty.studentIds.includes(studentId)) return true;
    duty.studentIds.push(studentId);
    this.#notify();
    return true;
  }

  clearDuty(dutyId) {
    const duty = this.#findDuty(dutyId);
    if (!duty || duty.studentIds.length === 0) return false;
    duty.studentIds = [];
    this.#notify();
    return true;
  }

  addDuty(titleValue = '新值日', noteValue = '') {
    const title = cleanPeopleTitle(titleValue);
    const note = cleanNote(noteValue);
    if (!title || note === null || this.#state.nextDutyId >= Number.MAX_SAFE_INTEGER) return null;
    const id = this.#state.nextDutyId + 1;
    const duty = { id, title, note, studentIds: [] };
    this.#state.duties.push(duty);
    this.#state.nextDutyId = id;
    this.#notify();
    return { id, title, note, studentIds: [] };
  }

  renameDuty(dutyId, value) {
    const title = cleanPeopleTitle(value);
    const duty = this.#findDuty(dutyId);
    if (!duty || !title || duty.title === title) return false;
    duty.title = title;
    this.#notify();
    return true;
  }

  updateDutyNote(dutyId, value) {
    const note = cleanNote(value);
    const duty = this.#findDuty(dutyId);
    if (!duty || note === null || duty.note === note) return false;
    duty.note = note;
    this.#notify();
    return true;
  }

  updateDuty(dutyId, { title, note } = {}) {
    const duty = this.#findDuty(dutyId);
    if (!duty) return false;
    let changed = false;
    if (title !== undefined) {
      const nextTitle = cleanPeopleTitle(title);
      if (!nextTitle) return false;
      if (duty.title !== nextTitle) {
        duty.title = nextTitle;
        changed = true;
      }
    }
    if (note !== undefined) {
      const nextNote = cleanNote(note);
      if (nextNote === null) return false;
      if (duty.note !== nextNote) {
        duty.note = nextNote;
        changed = true;
      }
    }
    if (changed) this.#notify();
    return changed;
  }

  deleteDuty(dutyId) {
    if (this.#state.duties.length <= 1) return false;
    const index = this.#state.duties.findIndex((duty) => duty.id === dutyId);
    if (index < 0) return false;
    this.#state.duties.splice(index, 1);
    this.#notify();
    return true;
  }

  clearAllDutyAssignments() {
    let changed = false;
    for (const duty of this.#state.duties) {
      if (duty.studentIds.length > 0) {
        duty.studentIds = [];
        changed = true;
      }
    }
    if (changed) this.#notify();
    return changed;
  }

  #findRole(roleId) {
    if (!Number.isSafeInteger(roleId)) return null;
    return this.#state.roles.find((role) => role.id === roleId) ?? null;
  }

  #findDuty(dutyId) {
    if (!Number.isSafeInteger(dutyId)) return null;
    return this.#state.duties.find((duty) => duty.id === dutyId) ?? null;
  }

  #findPeriod(periodId) {
    if (!Number.isSafeInteger(periodId)) return null;
    return this.#state.periods.find((period) => period.id === periodId) ?? null;
  }

  #findSubject(subjectId) {
    if (!Number.isSafeInteger(subjectId)) return null;
    return this.#state.subjects.find((subject) => subject.id === subjectId) ?? null;
  }

  #isValidScheduleCoord(day, periodId) {
    return Number.isInteger(day)
      && day >= 0
      && day < SCHEDULE_DAY_COUNT
      && Boolean(this.#findPeriod(periodId));
  }

  #hasStudent(studentId) {
    return Number.isSafeInteger(studentId) && this.#state.students.some(({ id }) => id === studentId);
  }

  #hasAssignment(assignmentId) {
    return Number.isSafeInteger(assignmentId) && this.#state.assignments.some(({ id }) => id === assignmentId);
  }

  #removeScore(studentId, assignmentId) {
    const originalLength = this.#state.scores.length;
    this.#state.scores = this.#state.scores.filter((score) => (
      score.assignmentId !== assignmentId || score.studentId !== studentId
    ));
    return originalLength !== this.#state.scores.length;
  }

  #notify() {
    if (this.#persist) {
      try {
        this.#persist(this.getSnapshot());
      } catch {
        // A storage failure must not roll back a valid in-memory change.
      }
    }
    for (const listener of this.#listeners) listener(this.getSnapshot());
  }
}

export function createRosterStore(initialState, persist) {
  return new RosterStore(initialState, persist);
}
