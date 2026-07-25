import {
  createDefaultRosterState,
  isValidRosterState,
  migrateRosterStateToCurrent,
  ROSTER_SCHEMA_VERSION
} from './roster-model.js';

export const ROSTER_STORAGE_KEY = 'teacher-workbench.roster.v1';

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function parseStoredRoster(value) {
  return migrateRosterStateToCurrent(value);
}

export function loadRosterState(storage = browserStorage()) {
  try {
    const serialized = storage?.getItem(ROSTER_STORAGE_KEY);
    if (serialized === null || serialized === undefined) return createDefaultRosterState();
    return parseStoredRoster(JSON.parse(serialized)) ?? createDefaultRosterState();
  } catch {
    return createDefaultRosterState();
  }
}

export function saveRosterState(state, storage = browserStorage()) {
  if (!isValidRosterState(state)) return false;
  try {
    storage?.setItem(ROSTER_STORAGE_KEY, JSON.stringify(state));
    return Boolean(storage);
  } catch {
    return false;
  }
}

export { ROSTER_SCHEMA_VERSION };
