/**
 * The arithmetic behind dragging a row to a new place in a vertical list —
 * pure, so the part that is easy to get off by one is tested rather than
 * dragged at. `src/components/theme/editor/use-sortable.ts` does the pointer
 * handling around it.
 */

/** Where a row sat when the drag began, in viewport pixels. */
export type RowBox = { top: number; height: number };

/**
 * Where the dragged row lands: its position in the list after the move, as
 * `moveSectionTo` and `moveBlockTo` take it. The row goes below every other
 * row whose middle its own middle has passed.
 */
export function dropIndex(draggedCenter: number, rows: readonly RowBox[], from: number): number {
  let index = 0;
  rows.forEach((row, i) => {
    if (i !== from && row.top + row.height / 2 < draggedCenter) index++;
  });
  return index;
}

/**
 * How far a row that is not being dragged slides, in pixels, to open the gap
 * where the dragged one will land: up by the dragged row's height (plus the
 * gap between rows) if the dragged row is passing it downwards, down if
 * upwards, otherwise not at all.
 */
export function rowShift(index: number, from: number, to: number, distance: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -distance;
  if (to < from && index >= to && index < from) return distance;
  return 0;
}

/** The space one row takes in the list: its height plus the gap after it. */
export function rowDistance(rows: readonly RowBox[], index: number): number {
  const row = rows[index];
  if (!row) return 0;
  const neighbour = rows[index + 1] ?? rows[index - 1];
  if (!neighbour) return row.height;

  const gap =
    neighbour.top > row.top
      ? neighbour.top - (row.top + row.height)
      : row.top - (neighbour.top + neighbour.height);
  return row.height + Math.max(0, gap);
}
