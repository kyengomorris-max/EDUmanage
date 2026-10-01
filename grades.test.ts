import { describe, expect, it } from "vitest";
import { bandFor, percentage, rankByAverage } from "./grades.js";
import { deriveInvoiceStatus, scholarshipValue } from "./finance.js";

const bands = [
  { minScore: 80, maxScore: 100, letter: "A", remark: "Excellent" },
  { minScore: 70, maxScore: 79, letter: "B", remark: "Very good" },
  { minScore: 60, maxScore: 69, letter: "C", remark: "Good" },
  { minScore: 50, maxScore: 59, letter: "D", remark: "Pass" },
  { minScore: 0, maxScore: 49, letter: "E", remark: "Needs improvement" },
];

describe("grades", () => {
  it("converts a score to a percentage and letter from the school scale", () => {
    expect(percentage(42, 50)).toBe(84);
    expect(bandFor(84, bands)?.letter).toBe("A");
    expect(bandFor(49, bands)?.letter).toBe("E");
    expect(bandFor(79, bands)?.letter).toBe("B");
  });

  it("ranks ties with the same position", () => {
    const ranked = rankByAverage([
      { id: "a", average: 70 },
      { id: "b", average: 90 },
      { id: "c", average: 90 },
    ]);
    expect(ranked.map((row) => row.position)).toEqual([1, 1, 3]);
  });
});

describe("finance", () => {
  it("marks overdue, partial, and paid invoices", () => {
    const yesterday = new Date("2026-01-01");
    expect(
      deriveInvoiceStatus({ total: 1000, discount: 0, paid: 0, dueDate: yesterday, now: new Date("2026-02-01") }),
    ).toBe("OVERDUE");
    expect(
      deriveInvoiceStatus({ total: 1000, discount: 100, paid: 200, dueDate: "2026-12-01", now: new Date("2026-02-01") }),
    ).toBe("PARTIAL");
    expect(
      deriveInvoiceStatus({ total: 1000, discount: 200, paid: 800, dueDate: "2026-12-01" }),
    ).toBe("PAID");
  });

  it("caps a scholarship at the invoice subtotal", () => {
    expect(scholarshipValue(1000, 200, 10)).toBe(300);
    expect(scholarshipValue(100, 80, 50)).toBe(100);
  });
});
