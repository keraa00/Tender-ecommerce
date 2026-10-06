"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { dropIndex, rowDistance, rowShift, type RowBox } from "@/lib/theme/sortable";

/**
 * Drag-to-reorder for a vertical list, on pointer events: mouse, touch and pen
 * alike, which the HTML drag-and-drop API is not. No dependency — the whole
 * job is a handle, a captured pointer and some arithmetic (`lib/theme/sortable`).
 *
 * Dragging is the pointer's way to reorder. The list's move up/down buttons
 * stay the keyboard's, so the handle is kept out of the tab order.
 */
export function useSortable(onMove: (from: number, to: number) => void) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const origin = useRef<{ y: number; boxes: RowBox[] } | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; offset: number } | null>(null);

  const finish = (commit: boolean) => {
    if (drag && commit && drag.to !== drag.from) onMove(drag.from, drag.to);
    origin.current = null;
    setDrag(null);
  };

  /** Spread on each row's element. */
  const rowRef = (index: number) => (element: HTMLElement | null) => {
    rows.current[index] = element;
  };

  /** Spread on each row's drag handle. */
  const handleProps = (index: number) => ({
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      origin.current = {
        y: event.clientY,
        boxes: rows.current.flatMap((row) => {
          if (!row) return [];
          const { top, height } = row.getBoundingClientRect();
          return [{ top, height }];
        }),
      };
      setDrag({ from: index, to: index, offset: 0 });
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!drag || !origin.current) return;
      const offset = event.clientY - origin.current.y;
      const box = origin.current.boxes[drag.from];
      const center = box.top + box.height / 2 + offset;
      setDrag({ ...drag, offset, to: dropIndex(center, origin.current.boxes, drag.from) });
    },
    onPointerUp() {
      finish(true);
    },
    onPointerCancel() {
      finish(false);
    },
    onLostPointerCapture() {
      if (drag) finish(false);
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.key === "Escape" && drag) finish(false);
    },
    tabIndex: -1,
    style: { touchAction: "none", cursor: drag ? "grabbing" : "grab" } as CSSProperties,
  });

  /** Spread on each row: moves it with the pointer, or out of its way. */
  const rowStyle = (index: number): CSSProperties | undefined => {
    if (!drag || !origin.current) return undefined;
    if (index === drag.from) {
      return {
        transform: `translateY(${drag.offset}px)`,
        position: "relative",
        zIndex: 10,
        boxShadow: "0 4px 12px rgb(0 0 0 / 0.12)",
      };
    }
    const shift = rowShift(index, drag.from, drag.to, rowDistance(origin.current.boxes, drag.from));
    return { transform: `translateY(${shift}px)`, transition: "transform 150ms ease" };
  };

  return { rowRef, handleProps, rowStyle, dragging: drag !== null };
}
