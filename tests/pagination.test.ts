import { describe, expect, it } from "vitest";

import { pageWindow, parsePage } from "@/lib/pagination";

describe("parsePage", () => {
  it("reads a positive whole number", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("7")).toBe(7);
  });

  it("falls back to the first page for anything else", () => {
    for (const value of [undefined, null, "", "0", "-2", "1.5", "two", "1e3", ["2"]]) {
      expect(parsePage(value), String(value)).toBe(1);
    }
    expect(parsePage("99999999999999999999")).toBe(1);
  });
});

describe("pageWindow", () => {
  it("describes a middle page", () => {
    expect(pageWindow(173, 2, 50)).toEqual({
      page: 2,
      pageCount: 4,
      total: 173,
      skip: 50,
      take: 50,
      from: 51,
      to: 100,
    });
  });

  it("stops the last page at the total", () => {
    expect(pageWindow(173, 4, 50)).toMatchObject({ skip: 150, from: 151, to: 173 });
  });

  it("lands a page past the end on the last page", () => {
    expect(pageWindow(173, 9, 50)).toMatchObject({ page: 4, skip: 150, from: 151, to: 173 });
  });

  it("treats an empty list as one empty page", () => {
    expect(pageWindow(0, 3, 50)).toMatchObject({ page: 1, pageCount: 1, skip: 0, from: 0, to: 0 });
  });

  it("fills exactly one page", () => {
    expect(pageWindow(50, 1, 50)).toMatchObject({ pageCount: 1, from: 1, to: 50 });
  });
});
