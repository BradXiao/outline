import { vi } from "vitest";
import Storage from "@shared/utils/Storage";
import { getCursorPosition, setCursorPosition } from "./cursorPosition";

describe("cursorPosition", () => {
  beforeEach(() => {
    Storage.clear();
  });

  it("returns undefined when no position is recorded", () => {
    expect(getCursorPosition("doc-1")).toBeUndefined();
  });

  it("records and retrieves a position per document", () => {
    setCursorPosition("doc-1", 42);
    setCursorPosition("doc-2", 7);

    expect(getCursorPosition("doc-1")).toBe(42);
    expect(getCursorPosition("doc-2")).toBe(7);
  });

  it("overwrites an existing position for the same document", () => {
    setCursorPosition("doc-1", 42);
    setCursorPosition("doc-1", 100);

    expect(getCursorPosition("doc-1")).toBe(100);
  });

  it("evicts the least recently updated entries beyond the limit", () => {
    let now = 0;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => (now += 1));

    for (let i = 0; i < 105; i++) {
      setCursorPosition(`doc-${i}`, i);
    }

    // The five oldest entries should have been evicted.
    expect(getCursorPosition("doc-0")).toBeUndefined();
    expect(getCursorPosition("doc-4")).toBeUndefined();
    expect(getCursorPosition("doc-5")).toBe(5);
    expect(getCursorPosition("doc-104")).toBe(104);

    spy.mockRestore();
  });
});
