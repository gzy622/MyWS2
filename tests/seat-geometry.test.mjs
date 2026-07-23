import assert from 'node:assert/strict';
import test from 'node:test';
import { SEAT_COLUMNS, SEAT_ROWS } from '../scripts/roster-model.js';
import {
  SEAT_CELL_HEIGHT,
  SEAT_CELL_WIDTH,
  SEAT_GRID_HEIGHT,
  SEAT_STAGE_FOOTER_HEIGHT,
  SEAT_STAGE_HEIGHT,
  SEAT_STAGE_WIDTH,
  SEAT_VIEW_GRID_HEIGHT,
  SEAT_VIEW_ROW_HEIGHT
} from '../scripts/seat-geometry.js';

test('座位画布几何与 13×8 逻辑网格保持一致', () => {
  assert.equal(SEAT_STAGE_WIDTH, SEAT_COLUMNS * SEAT_CELL_WIDTH);
  assert.equal(SEAT_GRID_HEIGHT, SEAT_ROWS * SEAT_CELL_HEIGHT);
  assert.equal(SEAT_VIEW_GRID_HEIGHT, SEAT_ROWS * SEAT_VIEW_ROW_HEIGHT);
  assert.equal(SEAT_STAGE_HEIGHT, SEAT_GRID_HEIGHT + SEAT_STAGE_FOOTER_HEIGHT);
  assert.equal(SEAT_STAGE_WIDTH, 1482);
  assert.equal(SEAT_STAGE_HEIGHT, 908);
});
