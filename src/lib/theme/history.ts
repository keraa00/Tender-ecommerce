/**
 * Undo and redo for the theme editor, as a pure reducer over immutable
 * snapshots. The operations in `./operations` never mutate a document, so a
 * snapshot is just a reference and a long history costs little.
 */

/** Steps kept to undo through. Older ones are dropped. */
export const HISTORY_LIMIT = 100;

/**
 * Edits to the same setting this close together are one step: typing a
 * heading is undone as the heading, not a letter at a time.
 */
export const COALESCE_MS = 1_000;

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  /** What the last edit changed, for coalescing; null after undo or redo. */
  lastKey: string | null;
  lastAt: number;
};

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

/**
 * Records `next` as the present. With a `key` naming what changed — a setting,
 * say — an edit to the same key within `COALESCE_MS` of the last replaces the
 * present instead of adding a step. A new edit after undoing discards what
 * could have been redone, as in every editor.
 */
export function pushHistory<T>(
  history: History<T>,
  next: T,
  { key = null, at = Date.now() }: { key?: string | null; at?: number } = {},
): History<T> {
  if (next === history.present) return history;

  const coalesce =
    key !== null &&
    key === history.lastKey &&
    at - history.lastAt < COALESCE_MS &&
    history.past.length > 0;

  return {
    past: coalesce ? history.past : [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    lastKey: key,
    lastAt: at,
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
    lastKey: null,
    lastAt: 0,
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
    lastKey: null,
    lastAt: 0,
  };
}
