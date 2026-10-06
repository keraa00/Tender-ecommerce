import { describe, expect, it } from "vitest";

import {
  canRedo,
  canUndo,
  COALESCE_MS,
  createHistory,
  HISTORY_LIMIT,
  pushHistory,
  redo,
  undo,
  type History,
} from "@/lib/theme/history";
import { dropIndex, rowDistance, rowShift } from "@/lib/theme/sortable";

/** Pushes each value as its own step, a second apart so nothing coalesces. */
function steps(...values: string[]): History<string> {
  return values.slice(1).reduce(
    (history, value, i) => pushHistory(history, value, { at: (i + 1) * 10_000 }),
    createHistory(values[0]),
  );
}

describe("history", () => {
  it("starts with nothing to undo or redo", () => {
    const history = createHistory("a");
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it("undoes and redoes step by step", () => {
    let history = steps("a", "b", "c");
    expect(history.present).toBe("c");

    history = undo(history);
    expect(history.present).toBe("b");
    history = undo(history);
    expect(history.present).toBe("a");
    expect(canUndo(history)).toBe(false);

    history = redo(history);
    expect(history.present).toBe("b");
    history = redo(history);
    expect(history.present).toBe("c");
    expect(canRedo(history)).toBe(false);
  });

  it("drops what could be redone once a new edit is made", () => {
    let history = undo(steps("a", "b", "c"));
    history = pushHistory(history, "d", { at: 99_000 });
    expect(history.present).toBe("d");
    expect(canRedo(history)).toBe(false);
    expect(undo(history).present).toBe("b");
  });

  it("ignores an edit that changes nothing", () => {
    const history = steps("a", "b");
    expect(pushHistory(history, history.present)).toBe(history);
  });

  it("groups quick edits to the same setting into one step", () => {
    let history = createHistory("");
    for (const [i, text] of ["H", "He", "Hel", "Hell", "Hello"].entries()) {
      history = pushHistory(history, text, { key: "hero:heading", at: 1_000 + i * 200 });
    }
    expect(history.present).toBe("Hello");
    expect(history.past).toEqual([""]);
    expect(undo(history).present).toBe("");
  });

  it("starts a new step for another setting, after a pause, or with no key", () => {
    let history = pushHistory(createHistory("a"), "b", { key: "heading", at: 0 });
    history = pushHistory(history, "c", { key: "text", at: 100 });
    expect(history.past).toEqual(["a", "b"]);

    history = pushHistory(history, "d", { key: "text", at: 100 + COALESCE_MS });
    expect(history.past).toEqual(["a", "b", "c"]);

    history = pushHistory(history, "e", { at: 100 + COALESCE_MS + 1 });
    history = pushHistory(history, "f", { at: 100 + COALESCE_MS + 2 });
    expect(history.past).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("does not fold an edit into the step before an undo", () => {
    let history = pushHistory(createHistory("a"), "b", { key: "heading", at: 0 });
    history = undo(history);
    history = pushHistory(history, "c", { key: "heading", at: 10 });
    expect(history.past).toEqual(["a"]);
    expect(history.present).toBe("c");
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    let history = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) {
      history = pushHistory(history, i, { at: i * 10_000 });
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toBe(20);

    for (let i = 0; i < HISTORY_LIMIT; i++) history = undo(history);
    expect(history.present).toBe(20);
    expect(canUndo(history)).toBe(false);
  });
});

describe("drag arithmetic", () => {
  // Four 40px rows with 4px between them: tops at 0, 44, 88, 132.
  const rows = [0, 44, 88, 132].map((top) => ({ top, height: 40 }));
  const middleOf = (index: number) => rows[index].top + 20;

  it("leaves a row where it is until its middle passes a neighbour's", () => {
    expect(dropIndex(middleOf(1), rows, 1)).toBe(1);
    expect(dropIndex(middleOf(1) + 23, rows, 1)).toBe(1);
    expect(dropIndex(middleOf(2) + 1, rows, 1)).toBe(2);
  });

  it("lands at either end, however far it is dragged", () => {
    expect(dropIndex(-500, rows, 2)).toBe(0);
    expect(dropIndex(5_000, rows, 0)).toBe(3);
  });

  it("moves upwards past the rows whose middles it has crossed", () => {
    expect(dropIndex(middleOf(1) - 1, rows, 3)).toBe(1);
    expect(dropIndex(middleOf(0) - 1, rows, 3)).toBe(0);
  });

  it("slides only the rows between where the row was and where it lands", () => {
    const distance = rowDistance(rows, 1);
    expect(distance).toBe(44);

    // Row 1 dragged down to 3: rows 2 and 3 slide up to fill its place.
    expect([0, 1, 2, 3].map((i) => rowShift(i, 1, 3, distance))).toEqual([0, 0, -44, -44]);
    // Row 3 dragged up to 1: rows 1 and 2 slide down.
    expect([0, 1, 2, 3].map((i) => rowShift(i, 3, 1, distance))).toEqual([0, 44, 44, 0]);
    // Not moved: nothing slides.
    expect([0, 1, 2, 3].map((i) => rowShift(i, 2, 2, distance))).toEqual([0, 0, 0, 0]);
  });

  it("measures a row with its gap, even the last one and a lone one", () => {
    expect(rowDistance(rows, 3)).toBe(44);
    expect(rowDistance([{ top: 10, height: 30 }], 0)).toBe(30);
    expect(rowDistance(rows, 9)).toBe(0);
  });
});
