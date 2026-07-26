/** Surname (first character) → pinyin initial for Demo roster + common fallbacks. */
const SURNAME_INITIALS = Object.freeze({
  赵: 'Z', 钱: 'Q', 孙: 'S', 李: 'L', 周: 'Z', 吴: 'W', 郑: 'Z', 王: 'W',
  冯: 'F', 陈: 'C', 褚: 'C', 卫: 'W', 蒋: 'J', 沈: 'S', 韩: 'H', 杨: 'Y',
  朱: 'Z', 秦: 'Q', 尤: 'Y', 许: 'X', 何: 'H', 吕: 'L', 施: 'S', 张: 'Z',
  孔: 'K', 曹: 'C', 严: 'Y', 华: 'H', 金: 'J', 魏: 'W', 陶: 'T', 姜: 'J',
  戚: 'Q', 谢: 'X', 邹: 'Z', 喻: 'Y', 柏: 'B', 水: 'S', 窦: 'D', 章: 'Z',
  云: 'Y', 苏: 'S', 潘: 'P', 葛: 'G', 奚: 'X', 范: 'F'
});

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * @param {string} name
 * @returns {'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'|'L'|'M'|'N'|'O'|'P'|'Q'|'R'|'S'|'T'|'U'|'V'|'W'|'X'|'Y'|'Z'|'#'}
 */
export function getNameInitial(name) {
  if (typeof name !== 'string') return '#';
  const trimmed = name.trim();
  if (!trimmed) return '#';
  const first = trimmed[0];
  if (/[A-Za-z]/.test(first)) return first.toUpperCase();
  return SURNAME_INITIALS[first] || '#';
}

export function listAlphabetLetters() {
  return LETTERS.split('');
}
