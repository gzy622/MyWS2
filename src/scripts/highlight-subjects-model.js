export const HIGHLIGHT_SUBJECTS_STORAGE_KEY = 'teacher-workbench.highlight-subjects';
export const MAX_HIGHLIGHT_PATTERNS = 20;
export const MAX_HIGHLIGHT_PATTERN_LENGTH = 40;

export function parseHighlightPatterns(raw) {
  if (typeof raw !== 'string') return [];
  const parts = raw.split(/[\n,，、;；]+/);
  const seen = new Set();
  const next = [];
  for (const part of parts) {
    const value = part.trim().slice(0, MAX_HIGHLIGHT_PATTERN_LENGTH);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
    if (next.length >= MAX_HIGHLIGHT_PATTERNS) break;
  }
  return next;
}

export function formatHighlightPatterns(list) {
  return (Array.isArray(list) ? list : []).join('、');
}

export function subjectMatchesHighlight(subject, list) {
  if (typeof subject !== 'string' || !subject || !Array.isArray(list) || !list.length) return false;
  const haystack = subject.trim().toLocaleLowerCase();
  if (!haystack) return false;
  return list.some((pattern) => (
    typeof pattern === 'string' && pattern && haystack.includes(pattern.toLocaleLowerCase())
  ));
}
