import { SEAT_COLUMNS, SEAT_ROWS } from './roster-model.js';

export const SEAT_CELL_WIDTH = 114;
export const SEAT_CELL_HEIGHT = 96;
export const SEAT_STAGE_FOOTER_HEIGHT = 140;
export const SEAT_STAGE_WIDTH = SEAT_COLUMNS * SEAT_CELL_WIDTH;
export const SEAT_GRID_HEIGHT = SEAT_ROWS * SEAT_CELL_HEIGHT;
export const SEAT_STAGE_HEIGHT = SEAT_GRID_HEIGHT + SEAT_STAGE_FOOTER_HEIGHT;

export const SEAT_VIEW_OCCUPIED_COLUMN_WIDTH = 100;
export const SEAT_VIEW_EMPTY_COLUMN_WIDTH = 12;
export const SEAT_VIEW_OCCUPIED_ROW_HEIGHT = 100;
export const SEAT_VIEW_EMPTY_ROW_HEIGHT = 12;
export const SEAT_VIEW_FOOTER_HEIGHT = 120;
export const SEAT_VIEW_MIN_SCALE = 0.45;

export function getAdjacentSeatIndex(seatIndex, key) {
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= SEAT_COLUMNS * SEAT_ROWS) return null;
  const row = Math.floor(seatIndex / SEAT_COLUMNS);
  const column = seatIndex % SEAT_COLUMNS;
  if (key === 'ArrowUp' && row > 0) return seatIndex - SEAT_COLUMNS;
  if (key === 'ArrowDown' && row < SEAT_ROWS - 1) return seatIndex + SEAT_COLUMNS;
  if (key === 'ArrowLeft' && column > 0) return seatIndex - 1;
  if (key === 'ArrowRight' && column < SEAT_COLUMNS - 1) return seatIndex + 1;
  return seatIndex;
}

export function getSeatViewGeometry(seats = []) {
  const occupiedColumns = new Set();
  const occupiedRows = new Set();
  for (const seat of seats) {
    if (!Number.isInteger(seat?.seatIndex) || seat.seatIndex < 0 || seat.seatIndex >= SEAT_COLUMNS * SEAT_ROWS) continue;
    occupiedColumns.add(seat.seatIndex % SEAT_COLUMNS);
    occupiedRows.add(Math.floor(seat.seatIndex / SEAT_COLUMNS));
  }
  const columns = Array.from({ length: SEAT_COLUMNS }, (_, column) => (
    occupiedColumns.has(column) ? SEAT_VIEW_OCCUPIED_COLUMN_WIDTH : SEAT_VIEW_EMPTY_COLUMN_WIDTH
  ));
  const rows = Array.from({ length: SEAT_ROWS }, (_, row) => (
    occupiedRows.has(row) ? SEAT_VIEW_OCCUPIED_ROW_HEIGHT : SEAT_VIEW_EMPTY_ROW_HEIGHT
  ));
  const width = columns.reduce((sum, value) => sum + value, 0);
  const gridHeight = rows.reduce((sum, value) => sum + value, 0);
  return {
    columns,
    rows,
    width,
    gridHeight,
    height: gridHeight + SEAT_VIEW_FOOTER_HEIGHT
  };
}
