import {
  cloneRosterState,
  createDefaultRosterState,
  isValidRosterState,
  parseScore,
  SEAT_COUNT
} from './roster-model.js';

function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name || null;
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

  resetRoster() {
    const defaults = createDefaultRosterState();
    this.#state.students = defaults.students;
    this.#state.seats = defaults.seats;
    this.#state.submissions = [];
    this.#state.scores = [];
    this.#notify();
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
