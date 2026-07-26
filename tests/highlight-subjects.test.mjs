import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHighlightPatterns,
  subjectMatchesHighlight
} from '../src/scripts/highlight-subjects-model.js';

test('解析顿号逗号换行并去重截断', () => {
  assert.deepEqual(
    parseHighlightPatterns('语文、数学, 英语\n语文'),
    ['语文', '数学', '英语']
  );
});

test('空串与空白不产生关键词', () => {
  assert.deepEqual(parseHighlightPatterns('  、\n  '), []);
});

test('包含匹配且大小写不敏感', () => {
  const patterns = parseHighlightPatterns('语文,math');
  assert.equal(subjectMatchesHighlight('语文阅读', patterns), true);
  assert.equal(subjectMatchesHighlight('MathA', patterns), true);
  assert.equal(subjectMatchesHighlight('英语', patterns), false);
});
