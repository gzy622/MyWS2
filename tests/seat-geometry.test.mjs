import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultRosterState, SEAT_COLUMNS, SEAT_ROWS } from '../src/scripts/roster-model.js';
import {
  getAdjacentSeatIndex,
  getSeatViewGeometry,
  SEAT_CARD_HEIGHT,
  SEAT_CARD_WIDTH,
  SEAT_CELL_HEIGHT,
  SEAT_CELL_WIDTH,
  SEAT_GRID_HEIGHT,
  SEAT_LANDSCAPE_CARD_HEIGHT,
  SEAT_LANDSCAPE_CARD_WIDTH,
  SEAT_LANDSCAPE_EMPTY_COLUMN_WIDTH,
  SEAT_LANDSCAPE_FOOTER_HEIGHT,
  SEAT_LANDSCAPE_OCCUPIED_COLUMN_WIDTH,
  SEAT_LANDSCAPE_OCCUPIED_ROW_HEIGHT,
  SEAT_STAGE_FOOTER_HEIGHT,
  SEAT_STAGE_HEIGHT,
  SEAT_STAGE_WIDTH,
  SEAT_VIEW_CARD_HEIGHT,
  SEAT_VIEW_CARD_WIDTH,
  SEAT_VIEW_EMPTY_COLUMN_WIDTH,
  SEAT_VIEW_EMPTY_ROW_HEIGHT,
  SEAT_VIEW_FOOTER_HEIGHT,
  SEAT_VIEW_MIN_SCALE,
  SEAT_VIEW_OCCUPIED_COLUMN_WIDTH,
  SEAT_VIEW_OUTER_COLUMN_WIDTH,
  SEAT_VIEW_OCCUPIED_ROW_HEIGHT
} from '../src/scripts/seat-geometry.js';

test('编辑模式画布几何与 13×8 逻辑网格保持一致', () => {
  assert.equal(SEAT_STAGE_WIDTH, SEAT_COLUMNS * SEAT_CELL_WIDTH);
  assert.equal(SEAT_GRID_HEIGHT, SEAT_ROWS * SEAT_CELL_HEIGHT);
  assert.equal(SEAT_STAGE_HEIGHT, SEAT_GRID_HEIGHT + SEAT_STAGE_FOOTER_HEIGHT);
  assert.equal(SEAT_CARD_WIDTH, 80);
  assert.equal(SEAT_CARD_HEIGHT, 104);
  assert.equal(SEAT_STAGE_WIDTH, 1040);
  assert.equal(SEAT_STAGE_HEIGHT, 972);
});

test('查看模式压缩空行列并保留可读缩放下限', () => {
  const geometry = getSeatViewGeometry(createDefaultRosterState().seats);
  assert.equal(geometry.columns.filter((value) => value === SEAT_VIEW_OCCUPIED_COLUMN_WIDTH).length, 8);
  assert.equal(geometry.columns.filter((value) => value === SEAT_VIEW_EMPTY_COLUMN_WIDTH).length, 3);
  assert.equal(geometry.columns.filter((value) => value === SEAT_VIEW_OUTER_COLUMN_WIDTH).length, 2);
  assert.equal(geometry.rows.filter((value) => value === SEAT_VIEW_OCCUPIED_ROW_HEIGHT).length, 6);
  assert.equal(geometry.rows.filter((value) => value === SEAT_VIEW_EMPTY_ROW_HEIGHT).length, 2);
  assert.equal(geometry.width, 560);
  assert.equal(geometry.gridHeight, 624);
  assert.equal(geometry.height, geometry.gridHeight + SEAT_VIEW_FOOTER_HEIGHT);
  assert.equal(SEAT_VIEW_CARD_WIDTH, 64);
  assert.equal(SEAT_VIEW_CARD_HEIGHT, 104);
  assert.equal(SEAT_VIEW_CARD_WIDTH * SEAT_VIEW_MIN_SCALE, 44);
});

test('主动横屏模式使用横向座位比例并保留压缩关系', () => {
  const geometry = getSeatViewGeometry(createDefaultRosterState().seats, { landscape: true });
  assert.equal(geometry.columns.filter((value) => value === SEAT_LANDSCAPE_OCCUPIED_COLUMN_WIDTH).length, 8);
  assert.equal(geometry.rows.filter((value) => value === SEAT_LANDSCAPE_OCCUPIED_ROW_HEIGHT).length, 6);
  assert.equal(geometry.gridHeight, 6 * SEAT_LANDSCAPE_OCCUPIED_ROW_HEIGHT);
  assert.equal(geometry.rowOffsets[1], 2 * SEAT_LANDSCAPE_OCCUPIED_COLUMN_WIDTH + SEAT_LANDSCAPE_EMPTY_COLUMN_WIDTH);
  assert.equal(geometry.rowOffsets[2], 0);
  assert.equal(geometry.height, geometry.gridHeight + SEAT_LANDSCAPE_FOOTER_HEIGHT);
  assert.ok(SEAT_LANDSCAPE_CARD_WIDTH > SEAT_LANDSCAPE_CARD_HEIGHT);
});

test('查看模式忽略非法座位索引', () => {
  const geometry = getSeatViewGeometry([{ seatIndex: -1 }, { seatIndex: 104 }, { seatIndex: 0 }]);
  assert.equal(geometry.columns[0], SEAT_VIEW_OCCUPIED_COLUMN_WIDTH);
  assert.equal(geometry.rows[0], SEAT_VIEW_OCCUPIED_ROW_HEIGHT);
  assert.equal(geometry.columns.slice(1).every((value) => value === SEAT_VIEW_OUTER_COLUMN_WIDTH), true);
});

test('键盘目标按 13×8 边界移动且不跨行', () => {
  assert.equal(getAdjacentSeatIndex(17, 'ArrowLeft'), 16);
  assert.equal(getAdjacentSeatIndex(17, 'ArrowUp'), 4);
  assert.equal(getAdjacentSeatIndex(0, 'ArrowUp'), 0);
  assert.equal(getAdjacentSeatIndex(0, 'ArrowLeft'), 0);
  assert.equal(getAdjacentSeatIndex(12, 'ArrowRight'), 12);
  assert.equal(getAdjacentSeatIndex(103, 'ArrowDown'), 103);
  assert.equal(getAdjacentSeatIndex(-1, 'ArrowRight'), null);
});
