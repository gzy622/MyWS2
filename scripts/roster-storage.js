import { cloneRosterState, createDefaultRosterState, isValidRosterState, ROSTER_SCHEMA_VERSION } from './roster-model.js';

export const ROSTER_STORAGE_KEY = 'teacher-workbench.roster.v1';

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function parseStoredRoster(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schemaVersion !== ROSTER_SCHEMA_VERSION) return null;
  return isValidRosterState(value) ? cloneRosterState(value) : null;
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
